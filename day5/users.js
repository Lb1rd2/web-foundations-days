// ---------- 1. Elements and settings ----------
const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusEl = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

// The loaded users are stored here, so filtering needs no new request
let users = [];

// ---------- 2. Draw any array of users ----------
function renderUsers(list) {
  usersList.replaceChildren();

  if (list.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No users match your filter.";
    usersList.append(empty);
    return;
  }

  for (const user of list) {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = "Email: " + user.email;

    const city = document.createElement("div");
    city.textContent = "City: " + user.address.city;

    const company = document.createElement("div");
    company.textContent = "Company: " + user.company.name;

    li.append(name, email, city, company);
    usersList.append(li);
  }
}

// ---------- 3. Filter the stored array ----------
function applyFilter() {
  if (users.length === 0) {
    return; // nothing loaded yet
  }
  const text = filterInput.value.trim().toLowerCase();
  const matches = users.filter(function (user) {
    return user.name.toLowerCase().includes(text);
  });
  renderUsers(matches);
}

// ---------- 4. Load the users from the API ----------
async function loadUsers() {
  statusEl.textContent = "Loading users...";
  loadBtn.disabled = true;

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("Server answered with status " + response.status);
    }

    users = await response.json();
    applyFilter();
    statusEl.textContent = "Loaded " + users.length + " users.";
  } catch (error) {
    statusEl.textContent = "Error: could not load users. " + error.message;
  } finally {
    loadBtn.disabled = false;
  }
}

// ---------- 5. Events ----------
loadBtn.addEventListener("click", loadUsers);
filterInput.addEventListener("input", applyFilter);