ALTER TABLE public.recipes
  ADD COLUMN total_time_minutes integer,
  ADD COLUMN additional_time_label text,
  ADD COLUMN additional_time_minutes integer,
  ADD CONSTRAINT recipes_total_time_minutes_nonnegative
    CHECK (total_time_minutes IS NULL OR total_time_minutes >= 0),
  ADD CONSTRAINT recipes_additional_time_label_length
    CHECK (
      additional_time_label IS NULL
      OR (
        additional_time_label = btrim(additional_time_label)
        AND char_length(additional_time_label) BETWEEN 1 AND 40
      )
    ),
  ADD CONSTRAINT recipes_additional_time_minutes_positive
    CHECK (additional_time_minutes IS NULL OR additional_time_minutes > 0),
  ADD CONSTRAINT recipes_additional_time_pair
    CHECK (
      (additional_time_label IS NULL)
      = (additional_time_minutes IS NULL)
    );
