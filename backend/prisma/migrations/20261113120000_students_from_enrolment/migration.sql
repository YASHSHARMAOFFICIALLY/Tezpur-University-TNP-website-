-- Existing students: branch and batch from the enrolment number (ECB24001 = programme ECB, admitted 2024),
-- the same rule registration now applies. Programme follows the code when it is a known programme;
-- admission and finishing years are only filled where empty (finishing = admission + programme years, default 4).
UPDATE students s SET programme_id = p.id
FROM programmes p
WHERE upper(left(s.enrolment_no, 3)) = upper(p.code) AND s.programme_id IS DISTINCT FROM p.id;

UPDATE students SET year_of_admission = 2000 + substring(enrolment_no from 4 for 2)::int
WHERE year_of_admission IS NULL AND enrolment_no ~ '^[A-Za-z]{3}[0-9]{2}'
  AND 2000 + substring(enrolment_no from 4 for 2)::int <= extract(year FROM now());

UPDATE students s SET year_of_completion = s.year_of_admission + coalesce((SELECT p.year FROM programmes p WHERE p.id = s.programme_id), 4)
WHERE s.year_of_completion IS NULL AND s.year_of_admission IS NOT NULL;
