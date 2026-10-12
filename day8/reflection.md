# Reflection

## The most difficult concept

The most difficult concept in the course was system design, especially understanding how a cache, a read replica and a queue work together. At first the diagrams were just boxes. I overcame this by working out the numbers myself (for example, four million reads a day is only 40 reads a second) and then asking what would break first. Once I could see which part would be under pressure, each component had a clear job and was easier to explain.

## What I would improve

Based on the feedback I received, I would improve how I check my work before I submit it. My Day 7 file was cut off halfway, so the upload flow and trade-offs were missing even though the rest was correct. In my capstone I would also test my design more carefully, for example by explaining what happens when the primary database fails during a busy period. Next time I will open the file on GitHub and scroll to the bottom before I submit.

## What I will learn next

Next, I want to learn how to build a real backend, starting with Node.js and Express, and connect it to a SQL database. My background is in cybersecurity and API security testing, so I also want to practise building secure APIs, with proper authentication, input validation and rate limiting, so I can both build and test them.