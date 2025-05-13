// server.js
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Phục vụ các file tĩnh từ thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Route mặc định để phục vụ file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route cho trang từ điển
app.get('/letter', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dictionary.html'));
});

// Route cho trang HANGMAN
app.get('/hangman', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'hangman.html'));
});

// NEW ROUTE for Learning Feature
app.get('/learn', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'learn.html'));
});

// NEW ROUTE for Sign-to-Text
app.get('/sign-to-text', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sign-to-text.html'));
});

// NEW ROUTE for Math Calculator
app.get('/math-calculator', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'math-calculator.html'));
});

// realtimee chatbot for ASL
app.get('/chatbot', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chatbot.html'));
});


// --- BOOK READER ROUTES ---
// NEW: Route for Book Listing page
app.get('/book', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'book-listing.html'));
});

// Route for Book Detail page (keeps the :slug parameter)
app.get('/book/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'book-detail.html'));
});

// Route for Chapter View page
app.get('/chapter/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chapter-view.html'));
});
// --- END OF BOOK READER ROUTES ---

// NEW ROUTE for Menja Game
app.get('/menja', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'menja', 'index.html'));
});
// Khởi động server
app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
    console.log(`Phục vụ các file tĩnh từ thư mục: ${path.join(__dirname, 'public')}`);
});