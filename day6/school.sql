-- Day 6: School database (SQLite)

PRAGMA foreign_keys = ON;

-- Start fresh so the file can be run again without errors
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ---------- 1. Tables ----------

CREATE TABLE students (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  title   TEXT NOT NULL,
  credits INTEGER NOT NULL
);

CREATE TABLE enrolments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id  INTEGER NOT NULL,
  grade      INTEGER CHECK (grade BETWEEN 0 AND 100),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (course_id)  REFERENCES courses(id),
  UNIQUE (student_id, course_id)  -- same student cannot join the same course twice
);

-- Index: speeds up looking up enrolments by course
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);

-- ---------- 2. Sample data ----------

INSERT INTO students (name, email) VALUES
  ('Amina Hassan',  'amina@example.com'),
  ('Brian Otieno',  'brian@example.com'),
  ('Carol Wanjiru', 'carol@example.com'),
  ('David Kimani',  'david@example.com');

INSERT INTO courses (title, credits) VALUES
  ('Web Foundations',       4),
  ('Databases',             3),
  ('Cyber Security Basics', 3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 78),
  (2, 1, 72),
  (3, 1, 90),
  (3, 3, 88),
  (2, 3, NULL);

-- ---------- 3. Queries ----------

-- Query 1: all courses for one student (by name)
SELECT c.title, e.grade
FROM students s
JOIN enrolments e ON s.id = e.student_id
JOIN courses c    ON c.id = e.course_id
WHERE s.name = 'Amina Hassan';

-- Query 2: all students on one course
SELECT s.name, s.email
FROM courses c
JOIN enrolments e ON c.id = e.course_id
JOIN students s   ON s.id = e.student_id
WHERE c.title = 'Web Foundations';

-- Query 3: number of students per course
SELECT c.title, COUNT(e.id) AS number_of_students
FROM courses c
LEFT JOIN enrolments e ON c.id = e.course_id
GROUP BY c.id, c.title;

-- Query 4: students who have no enrolments
SELECT s.name, s.email
FROM students s
LEFT JOIN enrolments e ON s.id = e.student_id
WHERE e.id IS NULL;

-- Query 5: update one enrolment's grade (Brian, Cyber Security Basics)
UPDATE enrolments
SET grade = 95
WHERE student_id = (SELECT id FROM students WHERE name = 'Brian Otieno')
  AND course_id  = (SELECT id FROM courses  WHERE title = 'Cyber Security Basics');

-- Check the update worked
SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c  ON c.id = e.course_id
WHERE s.name = 'Brian Otieno';