"use strict";

const STORAGE_KEY = "smart-library-books";
const VALID_STATUSES = new Set(["DISPONIBLE", "EMPRUNTE"]);

const elements = {
    form: document.querySelector("#book-form"),
    id: document.querySelector("#book-id"),
    title: document.querySelector("#title"),
    author: document.querySelector("#author"),
    category: document.querySelector("#category"),
    isbn: document.querySelector("#isbn"),
    formTitle: document.querySelector("#form-title"),
    submitButton: document.querySelector("#submit-button"),
    cancelEdit: document.querySelector("#cancel-edit"),
    search: document.querySelector("#search"),
    statusFilter: document.querySelector("#status-filter"),
    categoryFilter: document.querySelector("#category-filter"),
    sortOrder: document.querySelector("#sort-order"),
    bookList: document.querySelector("#book-list"),
    emptyState: document.querySelector("#empty-state"),
    emptyTitle: document.querySelector("#empty-title"),
    emptyMessage: document.querySelector("#empty-message"),
    addFirstBook: document.querySelector("#add-first-book"),
    resetFilters: document.querySelector("#reset-filters"),
    totalCount: document.querySelector("#total-count"),
    availableCount: document.querySelector("#available-count"),
    loanedCount: document.querySelector("#loaned-count"),
    visibleCount: document.querySelector("#visible-count"),
    notice: document.querySelector("#notice")
};

let books = [];
let noticeTimer;

function showNotice(message, kind = "error") {
    window.clearTimeout(noticeTimer);
    elements.notice.textContent = message;
    elements.notice.dataset.kind = kind;
    elements.notice.hidden = false;
    if (kind === "success") {
        noticeTimer = window.setTimeout(() => {
            elements.notice.hidden = true;
        }, 3200);
    }
}

function clearNotice() {
    window.clearTimeout(noticeTimer);
    elements.notice.hidden = true;
    elements.notice.textContent = "";
    delete elements.notice.dataset.kind;
}

function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLocaleLowerCase("fr");
}

function normalizeIsbn(value) {
    return String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
}

function isValidBook(book) {
    if (book === null || typeof book !== "object") return false;
    const [year, month, day] = typeof book.dateAdded === "string"
        ? book.dateAdded.split("-").map(Number)
        : [];
    const dateIsValid = Number.isInteger(year)
        && Number.isInteger(month)
        && Number.isInteger(day)
        && new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === book.dateAdded;

    return typeof book.id === "string"
        && book.id.length > 0
        && typeof book.title === "string"
        && book.title.trim().length > 0
        && typeof book.author === "string"
        && book.author.trim().length > 0
        && typeof book.category === "string"
        && book.category.trim().length > 0
        && typeof book.isbn === "string"
        && dateIsValid
        && VALID_STATUSES.has(book.status);
}

function loadBooks() {
    let storedBooks;
    try {
        storedBooks = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        showNotice("Le stockage local est inaccessible. Vos modifications ne pourront pas être conservées dans ce navigateur.");
        return [];
    }

    if (storedBooks === null) return [];

    try {
        const parsedBooks = JSON.parse(storedBooks);
        const ids = new Set();
        const hasDuplicateIds = Array.isArray(parsedBooks)
            && parsedBooks.some((book) => {
                if (!isValidBook(book) || ids.has(book.id)) return true;
                ids.add(book.id);
                return false;
            });
        if (!Array.isArray(parsedBooks) || hasDuplicateIds) {
            throw new Error("Le format de la collection enregistrée est invalide.");
        }
        return parsedBooks;
    } catch (error) {
        showNotice("Les données enregistrées sont illisibles ou invalides. Elles n’ont pas été remplacées automatiquement.");
        return [];
    }
}

function saveBooks(nextBooks) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextBooks));
        return true;
    } catch (error) {
        showNotice("Impossible d’enregistrer la collection dans le stockage local. Vérifiez l’espace disponible ou les paramètres de votre navigateur.");
        return false;
    }
}

function createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getToday() {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
}

function formatDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function getFilteredBooks() {
    const query = normalizeText(elements.search.value);
    const status = elements.statusFilter.value;
    const category = elements.categoryFilter.value;
    const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

    const result = books.filter((book) => {
        const matchesQuery = query.length === 0
            || normalizeText(book.title).includes(query)
            || normalizeText(book.author).includes(query);
        const matchesStatus = status === "all" || book.status === status;
        const matchesCategory = category === "all" || book.category === category;
        return matchesQuery && matchesStatus && matchesCategory;
    });

    const sortOrder = elements.sortOrder.value;
    result.sort((first, second) => {
        if (sortOrder === "title-asc") return collator.compare(first.title, second.title);
        if (sortOrder === "title-desc") return collator.compare(second.title, first.title);
        if (sortOrder === "author-asc") return collator.compare(first.author, second.author);
        if (sortOrder === "author-desc") return collator.compare(second.author, first.author);
        const dateDifference = first.dateAdded.localeCompare(second.dateAdded);
        return sortOrder === "oldest" ? dateDifference : -dateDifference;
    });
    return result;
}

function updateCategoryOptions() {
    const selectedCategory = elements.categoryFilter.value;
    const categories = [...new Set(books.map((book) => book.category))]
        .sort((first, second) => first.localeCompare(second, "fr", { sensitivity: "base" }));

    elements.categoryFilter.replaceChildren(new Option("Toutes les catégories", "all"));
    categories.forEach((category) => {
        elements.categoryFilter.add(new Option(category, category));
    });
    elements.categoryFilter.value = categories.includes(selectedCategory) ? selectedCategory : "all";
}

function createBookCard(book) {
    const card = createElement("article", "book-card");
    const cover = createElement("div", "book-cover", book.title.trim().charAt(0).toLocaleUpperCase("fr"));
    cover.setAttribute("aria-hidden", "true");

    const info = createElement("div", "book-info");
    info.append(createElement("h3", "book-title", book.title));
    info.append(createElement("p", "book-author", `par ${book.author}`));

    const metadata = createElement("div", "book-meta");
    metadata.append(createElement("span", "category-tag", book.category));
    metadata.append(createElement("span", "", `Ajouté le ${formatDate(book.dateAdded)}`));
    if (book.isbn.trim()) metadata.append(createElement("span", "book-isbn", `ISBN ${book.isbn}`));
    info.append(metadata);

    const side = createElement("div", "book-side");
    const isAvailable = book.status === "DISPONIBLE";
    side.append(createElement("span", `status-badge ${isAvailable ? "status-available" : "status-loaned"}`,
        isAvailable ? "Disponible" : "Emprunté"));

    const actions = createElement("div", "book-actions");
    const statusButton = createElement("button", "action-button", isAvailable ? "Emprunter" : "Retourner");
    statusButton.type = "button";
    statusButton.dataset.action = "toggle-status";
    statusButton.dataset.id = book.id;
    statusButton.setAttribute("aria-label", `${isAvailable ? "Emprunter" : "Retourner"} « ${book.title} »`);

    const editButton = createElement("button", "action-button", "Modifier");
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.dataset.id = book.id;
    editButton.setAttribute("aria-label", `Modifier « ${book.title} »`);

    const deleteButton = createElement("button", "action-button delete-button", "×");
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.id = book.id;
    deleteButton.setAttribute("aria-label", `Supprimer « ${book.title} »`);

    actions.append(statusButton, editButton, deleteButton);
    side.append(actions);
    card.append(cover, info, side);
    return card;
}

function render() {
    const selectedCategory = elements.categoryFilter.value;
    const categories = [...new Set(books.map((book) => book.category))]
        .sort((first, second) => first.localeCompare(second, "fr", { sensitivity: "base" }));
    elements.categoryFilter.replaceChildren(new Option("Toutes les catégories", "all"));
    categories.forEach((category) => elements.categoryFilter.add(new Option(category, category)));
    elements.categoryFilter.value = categories.includes(selectedCategory) ? selectedCategory : "all";

    const filteredBooks = getFilteredBooks();
    const availableCount = books.filter((book) => book.status === "DISPONIBLE").length;
    elements.totalCount.textContent = String(books.length);
    elements.availableCount.textContent = String(availableCount);
    elements.loanedCount.textContent = String(books.length - availableCount);
    elements.visibleCount.textContent = String(filteredBooks.length);
    elements.bookList.replaceChildren(...filteredBooks.map(createBookCard));
    elements.bookList.hidden = filteredBooks.length === 0;
    elements.emptyState.hidden = filteredBooks.length > 0;

    const hasFilters = elements.search.value.trim() !== ""
        || elements.statusFilter.value !== "all"
        || elements.categoryFilter.value !== "all";
    if (books.length === 0) {
        elements.emptyTitle.textContent = "Votre bibliothèque est encore vide";
        elements.emptyMessage.textContent = "Ajoutez votre premier livre avec le formulaire pour commencer votre collection.";
        elements.addFirstBook.hidden = false;
        elements.resetFilters.hidden = true;
    } else {
        const query = elements.search.value.trim();
        elements.emptyTitle.textContent = query
            ? `Aucun résultat pour « ${query} »`
            : "Aucun livre ne correspond aux filtres";
        elements.emptyMessage.textContent = query
            ? "Essayez un autre titre ou auteur, ou modifiez vos filtres."
            : "Modifiez vos filtres ou affichez à nouveau toute votre collection.";
        elements.addFirstBook.hidden = true;
        elements.resetFilters.hidden = !hasFilters;
    }
}

function resetForm() {
    elements.form.reset();
    elements.id.value = "";
    elements.formTitle.textContent = "Ajouter un livre";
    const addIcon = createElement("span", "", "＋");
    addIcon.setAttribute("aria-hidden", "true");
    elements.submitButton.replaceChildren(addIcon, document.createTextNode(" Ajouter le livre"));
    elements.cancelEdit.hidden = true;
    [elements.title, elements.author, elements.category, elements.isbn].forEach((input) => {
        input.closest(".field").classList.remove("field-has-error");
        input.removeAttribute("aria-invalid");
    });
}

function setEditMode(book) {
    elements.id.value = book.id;
    elements.title.value = book.title;
    elements.author.value = book.author;
    elements.category.value = book.category;
    elements.isbn.value = book.isbn;
    elements.formTitle.textContent = "Modifier le livre";
    const saveIcon = createElement("span", "", "✓");
    saveIcon.setAttribute("aria-hidden", "true");
    elements.submitButton.replaceChildren(saveIcon, document.createTextNode(" Enregistrer"));
    elements.cancelEdit.hidden = false;
    clearNotice();
    elements.title.focus();
    elements.formTitle.scrollIntoView({ behavior: "smooth", block: "center" });
}

function validateForm(title, author, category, isbn, currentId) {
    const requiredFields = [
        [elements.title, title, "Le titre"],
        [elements.author, author, "L’auteur"],
        [elements.category, category, "La catégorie"]
    ];
    for (const [input, value, label] of requiredFields) {
        input.closest(".field").classList.toggle("field-has-error", value.length === 0);
        input.toggleAttribute("aria-invalid", value.length === 0);
        if (value.length === 0) {
            showNotice(`${label} est obligatoire.`);
            input.focus();
            return false;
        }
    }

    const normalizedIsbn = normalizeIsbn(isbn);
    if (normalizedIsbn && books.some((book) =>
        book.id !== currentId && normalizeIsbn(book.isbn) === normalizedIsbn
    )) {
        elements.isbn.closest(".field").classList.add("field-has-error");
        elements.isbn.setAttribute("aria-invalid", "true");
        showNotice("Cet ISBN est déjà attribué à un autre livre.");
        elements.isbn.focus();
        return false;
    }
    elements.isbn.closest(".field").classList.remove("field-has-error");
    elements.isbn.removeAttribute("aria-invalid");
    return true;
}

elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearNotice();

    const currentId = elements.id.value;
    const title = elements.title.value.trim();
    const author = elements.author.value.trim();
    const category = elements.category.value.trim();
    const isbn = elements.isbn.value.trim();
    if (!validateForm(title, author, category, isbn, currentId)) return;

    let nextBooks;
    if (currentId) {
        const index = books.findIndex((book) => book.id === currentId);
        if (index === -1) {
            showNotice("Ce livre n’existe plus dans la collection. Actualisez la page avant de réessayer.");
            resetForm();
            return;
        }
        nextBooks = books.slice();
        nextBooks[index] = { ...books[index], title, author, category, isbn };
    } else {
        nextBooks = [...books, {
            id: createId(),
            title,
            author,
            category,
            isbn,
            dateAdded: getToday(),
            status: "DISPONIBLE"
        }];
    }

    if (!saveBooks(nextBooks)) return;
    books = nextBooks;
    resetForm();
    render();
    showNotice(currentId ? "Les informations du livre ont été mises à jour." : "Le livre a été ajouté à votre collection.", "success");
});

elements.bookList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const book = books.find((item) => item.id === button.dataset.id);
    if (!book) return;
    clearNotice();

    if (button.dataset.action === "edit") {
        setEditMode(book);
        return;
    }

    if (button.dataset.action === "toggle-status") {
        const nextBooks = books.map((item) => item.id === book.id
            ? { ...item, status: item.status === "DISPONIBLE" ? "EMPRUNTE" : "DISPONIBLE" }
            : item);
        if (!saveBooks(nextBooks)) return;
        books = nextBooks;
        render();
        showNotice(book.status === "DISPONIBLE"
            ? "Le livre a été marqué comme emprunté."
            : "Le livre a été marqué comme disponible.", "success");
        return;
    }

    if (button.dataset.action === "delete") {
        const confirmation = book.status === "EMPRUNTE"
            ? `« ${book.title} » est actuellement emprunté. Voulez-vous vraiment le supprimer de la collection ?`
            : `Voulez-vous vraiment supprimer « ${book.title} » ?`;
        if (!window.confirm(confirmation)) return;

        const nextBooks = books.filter((item) => item.id !== book.id);
        if (!saveBooks(nextBooks)) return;
        books = nextBooks;
        if (elements.id.value === book.id) resetForm();
        render();
        showNotice("Le livre a été supprimé de votre collection.", "success");
    }
});

elements.search.addEventListener("input", render);
[elements.statusFilter, elements.categoryFilter, elements.sortOrder].forEach((control) => {
    control.addEventListener("change", render);
});

elements.resetFilters.addEventListener("click", () => {
    elements.search.value = "";
    elements.statusFilter.value = "all";
    elements.categoryFilter.value = "all";
    render();
});

elements.addFirstBook.addEventListener("click", () => {
    elements.title.focus();
    elements.formTitle.scrollIntoView({ behavior: "smooth", block: "center" });
});

elements.cancelEdit.addEventListener("click", () => {
    resetForm();
    clearNotice();
});

[elements.title, elements.author, elements.category, elements.isbn].forEach((input) => {
    input.addEventListener("input", () => {
        input.closest(".field").classList.remove("field-has-error");
        input.removeAttribute("aria-invalid");
    });
});

books = loadBooks();
render();