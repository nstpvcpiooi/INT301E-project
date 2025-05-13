const express = require('express');
const path = require('path'); // Module path của Node.js để làm việc với đường dẫn file/thư mục

const app = express();
const port = process.env.PORT || 3000; // Sử dụng cổng môi trường hoặc 3000 mặc định

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
});