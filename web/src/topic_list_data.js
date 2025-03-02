import * as resolved_topic from "../shared/src/resolved_topic";

import * as hash_util from "./hash_util";
import * as narrow_state from "./narrow_state";
import * as stream_topic_history from "./stream_topic_history";
import * as sub_store from "./sub_store";
import * as unread from "./unread";
import * as user_topics from "./user_topics";
import * as util from "./util";

const max_topics = 8;
const max_topics_with_unread = 12;

function choose_topics(stream_id, topic_names, zoomed, topic_choice_state) {
    for (const [idx, topic_name] of topic_names.entries()) {
        const num_unread = unread.num_unread_for_topic(stream_id, topic_name);
        const is_active_topic = topic_choice_state.active_topic === topic_name.toLowerCase();
        const is_topic_muted = user_topics.is_topic_muted(stream_id, topic_name);
        const is_topic_unmuted = user_topics.is_topic_unmuted(stream_id, topic_name);
        const [topic_resolved_prefix, topic_display_name] =
            resolved_topic.display_parts(topic_name);
        // Important: Topics are lower-case in this set.
        const contains_unread_mention = topic_choice_state.topics_with_unread_mentions.has(
            topic_name.toLowerCase(),
        );

        if (!zoomed) {
            function should_show_topic(topics_selected) {
                // This function exists just for readability, to
                // avoid long chained conditionals to determine
                // which topics to include.

                // We always show the active topic.  Ideally, this
                // logic would first check whether the active
                // topic is in the set of those with unreads to
                // avoid ending up with max_topics_with_unread + 1
                // total topics if the active topic comes after
                // the first several topics with unread messages.
                if (is_active_topic) {
                    return true;
                }

                // We unconditionally skip showing muted topics
                // when not zoomed, even if they have unread
                // messages.
                if (is_topic_muted) {
                    return false;
                }

                // We include the most recent max_topics topics,
                // even if there are no unread messages.
                if (idx < max_topics && topics_selected < max_topics) {
                    return true;
                }

                // We include older topics with unread messages up
                // until max_topics_with_unread total topics have
                // been included.
                if (num_unread > 0 && topics_selected < max_topics_with_unread) {
                    return true;
                }

                // Otherwise, we don't show the topic in the
                // unzoomed view.  We might display its unread
                // count in in "more topics" if it is not muted.
                return false;
            }

            const show_topic = should_show_topic(topic_choice_state.topics_selected);
            if (!show_topic) {
                if (!is_topic_muted) {
                    // The "more topics" unread count, like
                    // stream-level counts, only counts messages
                    // on unmuted topics.
                    topic_choice_state.more_topics_unreads += num_unread;
                    if (contains_unread_mention) {
                        topic_choice_state.more_topics_have_unread_mention_messages = true;
                    }
                }
                continue;
            }
            topic_choice_state.topics_selected += 1;
            // We fall through to rendering the topic, using the
            // same code we do when zoomed.
        }

        const topic_info = {
            topic_name,
            topic_resolved_prefix,
            topic_display_name,
            unread: num_unread,
            is_zero: num_unread === 0,
            is_muted: is_topic_muted,
            is_unmuted: is_topic_unmuted,
            is_active_topic,
            url: hash_util.by_stream_topic_url(stream_id, topic_name),
            contains_unread_mention,
        };

        topic_choice_state.items.push(topic_info);
    }
}

export function get_list_info(stream_id, zoomed, search_term) {
    const topic_choice_state = {
        items: [],
        topics_selected: 0,
        more_topics_unreads: 0,
        more_topics_have_unread_mention_messages: false,
        active_topic: narrow_state.topic()?.toLowerCase(),
        topics_with_unread_mentions: unread.get_topics_with_unread_mentions(stream_id),
    };

    const stream_muted = sub_store.get(stream_id).is_muted;

    let topic_names = stream_topic_history.get_recent_topic_names(stream_id);
    if (zoomed) {
        topic_names = util.filter_by_word_prefix_match(topic_names, search_term, (item) => item);
    }

    if (stream_muted && !zoomed) {
        const unmuted_topics = topic_names.filter((topic) =>
            user_topics.is_topic_unmuted(stream_id, topic),
        );
        choose_topics(stream_id, unmuted_topics, zoomed, topic_choice_state);

        const other_topics = topic_names.filter(
            (topic) => !user_topics.is_topic_unmuted(stream_id, topic),
        );
        choose_topics(stream_id, other_topics, zoomed, topic_choice_state);
    } else {
        choose_topics(stream_id, topic_names, zoomed, topic_choice_state);
    }

    return {
        items: topic_choice_state.items,
        num_possible_topics: topic_names.length,
        more_topics_unreads: topic_choice_state.more_topics_unreads,
        more_topics_have_unread_mention_messages:
            topic_choice_state.more_topics_have_unread_mention_messages,
    };
}
