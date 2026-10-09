# School Database Design

## Tables

### students
Stores one row for each student.

- `id`: primary key, a unique number for each student
- `name`: the student's full name (required)
- `email`: the student's email (required and unique, so two students cannot share one)

### courses
Stores one row for each course.

- `id`: primary key
- `title`: the course name (required)
- `credits`: how many credits the course is worth (required)

### enrolments
Stores one row each time a student joins a course.

- `id`: primary key
- `student_id`: foreign key pointing to `students(id)`
- `course_id`: foreign key pointing to `courses(id)`
- `grade`: the student's grade from 0 to 100. It can be empty until the course is marked.
- A `UNIQUE (student_id, course_id)` rule stops the same student enrolling on the same course twice.

## Relationships

- **One student to many enrolments (one-to-many):** a student can have many enrolments, but each enrolment belongs to one student.
- **One course to many enrolments (one-to-many):** a course can have many enrolments, but each enrolment belongs to one course.
- **Students to courses (many-to-many):** a student can take many courses, and a course can have many students.

A **join table** is needed for a many-to-many relationship. A single column cannot hold a list of courses for a student, or a list of students for a course. The `enrolments` table solves this by storing one row for each student-and-course pair. It is also the right place for the grade, because a grade belongs to the pair and not to the student or the course alone.

## Index

I would add an index on `enrolments(course_id)`.

- **Reason:** queries like "all students on one course" and "number of students per course" search enrolments by `course_id`. Without an index, the database reads every enrolment row. The index lets it jump straight to the matching rows, which matters as the school grows.
- The `UNIQUE (student_id, course_id)` rule already creates an index that helps searches by `student_id`, so `course_id` is the one that is missing.

## SQL or NoSQL?

I would choose **SQL** for this system. The data is structured and has clear relationships between students, courses and enrolments, and SQL joins handle these questions well, such as "which students are on this course". SQL also enforces rules for me: unique emails, no double enrolments, and foreign keys so an enrolment cannot point to a student who does not exist. Accuracy matters for school records and grades. NoSQL is better when data has no fixed shape or must scale across many servers, and a school system does not need that.