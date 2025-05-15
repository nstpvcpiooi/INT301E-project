# INT3011E 5 - Các vấn đề hiện đại KHMT

---
## Chạy project
* Yêu cầu với môi trường trước khi chạy
  - Node.js và npm 
* Các bước chạy
  1. Clone project này về, sau đó:
     ```bash
     cd INT301E--project
     ```
  2. Tải tất cả các dependency cần thiết:
     ```bash
     npm install
     ```
  3. Chạy ứng dụng ở localhost:3000.

---
## Note
Để sử dụng tính năng chatbot, tạo thêm file config.js trong thư mục public, sau đó định nghĩa như sau:
```
const OPENAI_API_KEY = 'your_openai_api_key_here';
```

Khi dùng chatbot, mặc định là nếu trong vòng 1 giây không nhận diện được ký tự chữ cái nào mới thì sẽ thêm dấu cách vào phần tin nhắn. Đồng thời, nếu giữ nguyên một động tác tay trong vòng 2 giây thi app sẽ tự hiểu là người dùng muốn giơ ký tự mình đang giơ.
