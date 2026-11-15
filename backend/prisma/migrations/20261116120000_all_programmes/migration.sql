-- Every programme on the university's list (T&P mail, 14 Nov 2026). Before this only CSB, ECB, BAM and CHI existed,
-- so M.Tech and most other students could not find their programme.
-- Codes: the code is matched against the first 3 letters of the enrolment number, and that moves students.
-- Only prefixes we have seen in real enrolment numbers are 3 letters (CEB, EEB, MEB, BED). The rest use a
-- hyphenated code that never matches an enrolment number; admin can change it to the real prefix
-- in Admin > Content, which then links those students.
-- Re-running is harmless: existing codes are skipped.
INSERT INTO programmes (id, department, name, code, year) VALUES
  -- School of Engineering
  (gen_random_uuid()::text, 'School of Engineering', 'B.Tech Civil Engineering', 'CEB', 4),
  (gen_random_uuid()::text, 'School of Engineering', 'B.Tech Electrical Engineering', 'EEB', 4),
  (gen_random_uuid()::text, 'School of Engineering', 'B.Tech Mechanical Engineering', 'MEB', 4),
  (gen_random_uuid()::text, 'School of Engineering', 'B.Tech Food Engineering & Technology', 'BTECH-FET', 4),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Civil Engineering', 'MTECH-CE', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Computer Science & Engineering', 'MTECH-CSE', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Data Science', 'MTECH-DS', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Electrical Engineering', 'MTECH-EE', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Bioelectronics', 'MTECH-BIOELEC', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Electronics Design & Technology', 'MTECH-EDT', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Semiconductor Technology', 'MTECH-SEMI', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Energy Technology', 'MTECH-ENERGY', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Solar Energy Engineering', 'MTECH-SOLAR', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Food Engineering & Technology', 'MTECH-FET', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Mechanical Engineering', 'MTECH-ME', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Tech Manufacturing Technology & Automation', 'MTECH-MTA', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'MCA Computer Applications', 'MCA-CA', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'B.Des', 'BDES', 4),
  (gen_random_uuid()::text, 'School of Engineering', 'M.Des Design', 'MDES', 2),
  (gen_random_uuid()::text, 'School of Engineering', 'Executive Development Program Renewable Energy & Energy Management', 'EDP-ENERGY', NULL),
  (gen_random_uuid()::text, 'School of Engineering', 'Ph.D. Applied Sciences', 'PHD-AS', NULL),
  (gen_random_uuid()::text, 'School of Engineering', 'Ph.D. Civil Engineering', 'PHD-CE', NULL),
  (gen_random_uuid()::text, 'School of Engineering', 'Ph.D. Computer Science & Engineering', 'PHD-CSE', NULL),
  (gen_random_uuid()::text, 'School of Engineering', 'Ph.D. Design', 'PHD-DES', NULL),
  (gen_random_uuid()::text, 'School of Engineering', 'Ph.D. Electrical Engineering', 'PHD-EE', NULL),
  (gen_random_uuid()::text, 'School of Engineering', 'Ph.D. Electronics & Communication Engineering', 'PHD-ECE', NULL),
  (gen_random_uuid()::text, 'School of Engineering', 'Ph.D. Energy', 'PHD-ENERGY', NULL),
  (gen_random_uuid()::text, 'School of Engineering', 'Ph.D. Food Engineering & Technology', 'PHD-FET', NULL),
  (gen_random_uuid()::text, 'School of Engineering', 'Ph.D. Mechanical Engineering', 'PHD-ME', NULL),
  -- School of Sciences
  (gen_random_uuid()::text, 'School of Sciences', 'M.Sc Chemistry', 'MSC-CHEM', 2),
  (gen_random_uuid()::text, 'School of Sciences', 'M.Sc Environmental Science', 'MSC-ENV', 2),
  (gen_random_uuid()::text, 'School of Sciences', 'M.Sc Mathematics', 'MSC-MATH', 2),
  (gen_random_uuid()::text, 'School of Sciences', 'M.Sc Molecular Biology & Biotechnology', 'MSC-MBBT', 2),
  (gen_random_uuid()::text, 'School of Sciences', 'M.Sc Physics', 'MSC-PHY', 2),
  (gen_random_uuid()::text, 'School of Sciences', 'Integrated M.Sc Mathematics', 'IMSC-MATH', 5),
  (gen_random_uuid()::text, 'School of Sciences', 'Integrated M.Sc Life Science', 'IMSC-LIFE', 5),
  (gen_random_uuid()::text, 'School of Sciences', 'Integrated M.Sc Physics', 'IMSC-PHY', 5),
  (gen_random_uuid()::text, 'School of Sciences', 'Ph.D. Chemical Sciences', 'PHD-CHEM', NULL),
  (gen_random_uuid()::text, 'School of Sciences', 'Ph.D. Environmental Sciences', 'PHD-ENV', NULL),
  (gen_random_uuid()::text, 'School of Sciences', 'Ph.D. Mathematical Sciences', 'PHD-MATH', NULL),
  (gen_random_uuid()::text, 'School of Sciences', 'Ph.D. Molecular Biology & Biotechnology', 'PHD-MBBT', NULL),
  (gen_random_uuid()::text, 'School of Sciences', 'Ph.D. Physics', 'PHD-PHY', NULL),
  -- School of Management Sciences
  (gen_random_uuid()::text, 'School of Management Sciences', 'Master''s Tourism & Travel Management', 'MTTM', 2),
  (gen_random_uuid()::text, 'School of Management Sciences', 'MBA (Executive) Online/Part-time', 'MBA-EXEC', 2),
  (gen_random_uuid()::text, 'School of Management Sciences', 'PG Diploma Financial Market', 'PGD-FM', 1),
  (gen_random_uuid()::text, 'School of Management Sciences', 'M.Com', 'MCOM', 2),
  (gen_random_uuid()::text, 'School of Management Sciences', 'Integrated M.Com', 'IMCOM', 5),
  (gen_random_uuid()::text, 'School of Management Sciences', 'Ph.D. Business Administration', 'PHD-BA', NULL),
  (gen_random_uuid()::text, 'School of Management Sciences', 'Ph.D. Commerce', 'PHD-COM', NULL),
  -- School of Humanities and Social Sciences
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. Assamese', 'MA-ASM', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Assamese', 'PHD-ASM', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. Cultural Studies', 'MA-CULT', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Cultural Studies', 'PHD-CULT', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'B.Ed', 'BED', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Integrated B.Sc.B.Ed Physics', 'IBED-PHY', 4),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Integrated B.Sc.B.Ed Chemistry', 'IBED-CHEM', 4),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Integrated B.Sc.B.Ed Mathematics', 'IBED-MATH', 4),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.Ed', 'MED-EDU', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. Education', 'MA-EDU', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Education', 'PHD-EDU', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Integrated M.A. English', 'IMA-ENG', 5),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. English', 'MA-ENG', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. English', 'PHD-ENG', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'B.A. Chinese', 'BA-CHI', 4),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. Hindi', 'MA-HIN', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Master''s Translation Studies', 'MA-TRANS', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Hindi', 'PHD-HIN', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'LL.M.', 'LLM-LAW', 1),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Law', 'PHD-LAW', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. Linguistics & Language Technology', 'MA-LLT', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'B.A. Linguistics & Language Technology', 'BA-LLT', 4),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Linguistics & Language Technology', 'PHD-LLT', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. Mass Communication & Journalism', 'MA-MCJ', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Mass Communication & Journalism', 'PHD-MCJ', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. Social Work', 'MA-SW', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Social Work', 'PHD-SW', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. Sociology', 'MA-SOC', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'B.A. Sociology', 'BA-SOC', 4),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Sociology', 'PHD-SOC', NULL),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'M.A. Women Studies', 'MA-WS', 2),
  (gen_random_uuid()::text, 'School of Humanities and Social Sciences', 'Ph.D. Women Studies', 'PHD-WS', NULL)
ON CONFLICT (code) DO NOTHING;

-- Lengths were left at the 4-year default: MBA is 2 years, integrated M.Sc 5.
UPDATE programmes SET year = 2 WHERE code = 'BAM' AND year = 4;
UPDATE programmes SET year = 5 WHERE code = 'CHI' AND year = 4;

-- Same rule as syncProgrammeStudents: the enrolment prefix decides the programme and its finishing year.
UPDATE students s SET programme_id = p.id,
  year_of_completion = coalesce(s.year_of_admission + coalesce(p.year, 4), s.year_of_completion)
FROM programmes p
WHERE upper(left(s.enrolment_no, 3)) = upper(p.code);
