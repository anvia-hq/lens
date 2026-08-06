ALTER TABLE spans ADD COLUMN IF NOT EXISTS cached_input_tokens UInt64 DEFAULT 0 AFTER input_tokens;

ALTER TABLE spans UPDATE cached_input_tokens = least(
  input_tokens,
  coalesce(
    toUInt64OrNull(JSONExtractRaw(span_attributes, 'anvia.usage.cached_input_tokens')),
    toUInt64OrNull(JSONExtractString(span_attributes, 'anvia.usage.cached_input_tokens')),
    toUInt64OrNull(JSONExtractRaw(span_attributes, 'gen_ai.usage.cached_input_tokens')),
    toUInt64OrNull(JSONExtractString(span_attributes, 'gen_ai.usage.cached_input_tokens')),
    toUInt64OrNull(JSONExtractRaw(JSONExtractString(span_attributes, 'langfuse.observation.usage_details'), 'cached_input_tokens')),
    toUInt64OrNull(JSONExtractString(JSONExtractString(span_attributes, 'langfuse.observation.usage_details'), 'cached_input_tokens')),
    toUInt64OrNull(JSONExtractRaw(JSONExtractString(span_attributes, 'langfuse.observation.usage_details'), 'cache_read_input_tokens')),
    toUInt64OrNull(JSONExtractString(JSONExtractString(span_attributes, 'langfuse.observation.usage_details'), 'cache_read_input_tokens')),
    toUInt64OrNull(JSONExtractRaw(JSONExtractString(span_attributes, 'langfuse.observation.usage_details'), 'input_cache_read')),
    toUInt64OrNull(JSONExtractString(JSONExtractString(span_attributes, 'langfuse.observation.usage_details'), 'input_cache_read')),
    0
  )
) WHERE true SETTINGS mutations_sync = 2;
