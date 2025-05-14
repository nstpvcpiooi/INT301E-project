// server.js
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Phục vụ các file tĩnh từ thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Route cho trang chính (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Route settings.html
app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
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

//cho nay lam rieng mot tab truyen, cai file homepage-comics.html co khi de tu tu
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
//cho nay lam rieng mot tab game menja nhe 
app.get('/menja', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'menja', 'index.html'));
});
// Khởi động server
app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
    console.log(`Phục vụ các file tĩnh từ thư mục: ${path.join(__dirname, 'public')}`);

    console.log(`Đường dẫn đến trang cài đặt: http://localhost:${port}/settings`);
    console.log(`Đường dẫn đến trang luyện tập bảng chữ cái: http://localhost:${port}/letter`);
    console.log(`Đường dẫn đến trang trò chơi HANGMAN: http://localhost:${port}/hangman`);
    console.log(`Đường dẫn đến trang Học từ vựng: http://localhost:${port}/learn`);
    console.log(`Đường dẫn đến trang Chuyển đổi chữ ký thành văn bản: http://localhost:${port}/sign-to-text`);
    console.log(`Đường dẫn đến trang Máy tính toán học: http://localhost:${port}/math-calculator`);
    console.log(`Đường dẫn đến trang Chatbot: http://localhost:${port}/chatbot`);
});