-- Title-case existing competency tags: "game design" -> "Game Design".
-- SQLite has no title-case function, so walk each tag char-by-char with a
-- recursive CTE, upper-casing the first letter and any letter after a
-- separator (space, hyphen, slash). OR REPLACE collapses any case-variant
-- duplicates that would collide on the (student_user_id, tag) primary key.
UPDATE OR REPLACE student_competency AS sc
SET tag = (
  WITH RECURSIVE r(i, out) AS (
    SELECT 1, upper(substr(sc.tag, 1, 1))
    UNION ALL
    SELECT i + 1,
      out || CASE
        WHEN substr(sc.tag, i, 1) IN (' ', '-', '/')
          THEN upper(substr(sc.tag, i + 1, 1))
        ELSE lower(substr(sc.tag, i + 1, 1))
      END
    FROM r WHERE i < length(sc.tag)
  )
  SELECT out FROM r ORDER BY i DESC LIMIT 1
);
