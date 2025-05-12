const express = require('express');
const path = require('path'); // Module path của Node.js để làm việc với đường dẫn file/thư mục

const app = express();
const port = process.env.PORT || 3000; // Sử dụng cổng môi trường hoặc 3000 mặc định

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

// *** NEW ROUTE for Learning Feature ***
app.get('/learn', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'learn.html'));
});

// *** NEW ROUTE for Sign-to-Text ***
app.get('/sign-to-text', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sign-to-text.html'));
});

// *** NEW ROUTE for Math Calculator ***
app.get('/math-calculator', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'math-calculator.html'));
});

// realtimee chatbot for ASL
app.get('/chatbot', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chatbot.html'));
});

// Khởi động server
app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
    console.log(`Phục vụ các file tĩnh từ thư mục: ${path.join(__dirname, 'public')}`);
});