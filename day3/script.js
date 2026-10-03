// ---------- Starting data ----------
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// Helper: tidy text (trim, one space between words, lowercase)
function normalise(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

// ---------- 1. searchNotes ----------
function searchNotes(word) {
  const target = word.toLowerCase();
  return notes.filter(function (note) {
    return note.text.toLowerCase().includes(target);
  });
}

// ---------- 2. longestNote ----------
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// ---------- 3. countByCategory ----------
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category]) {
      counts[note.category] = counts[note.category] + 1;
    } else {
      counts[note.category] = 1;
    }
  }
  return counts;
}

// ---------- 4. getSummary ----------
function getSummary() {
  const counts = countByCategory();
  const personal = counts.personal || 0;
  const work = counts.work || 0;
  const study = counts.study || 0;
  return notes.length + " notes: " + personal + " personal, " + work + " work, " + study + " study.";
}

// ---------- 5. isDuplicate ----------
function isDuplicate(text) {
  const target = normalise(text);
  return notes.some(function (note) {
    return normalise(note.text) === target;
  });
}

// ---------- 6. addNote ----------
function addNote(text, category) {
  const cleanText = text.trim().replace(/\s+/g, " ");

  if (cleanText.length < 1 || cleanText.length > 200) {
    console.log("Not added: text must be 1 to 200 characters.");
    return false;
  }
  if (isDuplicate(cleanText)) {
    console.log("Not added: this note already exists.");
    return false;
  }
  if (category !== "personal" && category !== "work" && category !== "study") {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }

  let newId = 1;
  for (const note of notes) {
    if (note.id >= newId) {
      newId = note.id + 1;
    }
  }
  notes.push({ id: newId, text: cleanText, category: category });
  return true;
}

// ---------- Tests ----------
console.log("--- searchNotes ---");
console.log(searchNotes("JAVASCRIPT"));   // 1 note: "Revise JavaScript arrays"
console.log(searchNotes("the"));          // 2 notes: ids 2 and 3
console.log(searchNotes("xyz"));          // [] (empty)

console.log("--- longestNote ---");
console.log(longestNote());               // id 3: "Email the project report to Grace"
const savedNotes = notes;
notes = [];
console.log(longestNote());               // null
notes = savedNotes;

console.log("--- countByCategory ---");
console.log(countByCategory());           // { personal: 2, study: 2, work: 1 }

console.log("--- getSummary ---");
console.log(getSummary());                // 5 notes: 2 personal, 1 work, 2 study.

console.log("--- isDuplicate ---");
console.log(isDuplicate("  buy MILK   and bread "));  // true
console.log(isDuplicate("Walk the dog"));             // false

console.log("--- addNote ---");
console.log(addNote("Walk the dog", "personal"));     // true
console.log(addNote("walk the dog", "personal"));     // false (duplicate)
console.log(addNote("", "work"));                     // false (empty)
console.log(addNote("x".repeat(201), "work"));        // false (too long)
console.log(addNote("Plan holiday", "fun"));          // false (bad category)

console.log("--- getSummary after adding ---");
console.log(getSummary());                // 6 notes: 3 personal, 1 work, 2 study.