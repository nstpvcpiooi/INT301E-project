// import { Hands } from '@mediapipe/hands';
// import { Camera } from '@mediapipe/camera_utils';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');
const recognizedTextElement = document.getElementById('recognizedText');
const responseElement = document.getElementById('response');
const startCameraButton = document.getElementById('startCamera'); // Nút "Bật Camera"
const sendButton = document.getElementById('send-button');
let recognizedSequence = ''; // Chuỗi ký tự thủ ngữ
let camera = null;
let mediaPipeHands = null;
let trainingData = []; // Dữ liệu huấn luyện cho mô hình

// Khởi tạo giao diện ban đầu
function setupInitialUI() {
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = "Đang khởi tạo... Vui lòng chờ.";
    }
    recognizedTextElement.textContent = ''; // Xóa chuỗi ký tự đã nhận diện
    responseElement.textContent = ''; // Xóa phản hồi từ chatbot
}

// Tải dữ liệu huấn luyện
function loadTrainingData() {
    const data = localStorage.getItem('trainingData');
    if (data) {
        try {
            trainingData = JSON.parse(data);
            console.log(`Đã tải ${trainingData.length} mẫu huấn luyện từ localStorage.`);
        } catch (err) {
            console.error('Lỗi khi tải dữ liệu huấn luyện:', err);
            trainingData = [];
        }
    } else {
        console.warn('Không tìm thấy dữ liệu huấn luyện trong localStorage.');
    }
}

// Khởi tạo MediaPipe Hands
function initializeMediaPipeHands() {
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = "Đang tải MediaPipe...";
    mediaPipeHands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    mediaPipeHands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });
    mediaPipeHands.onResults(onHandResults); // Callback khi có kết quả
    if (statusText) statusText.textContent = "MediaPipe đã sẵn sàng.";
}

// Xử lý kết quả từ MediaPipe Hands
function onHandResults(results) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const handData = landmarks.map(point => `${point.x},${point.y},${point.z}`).join(';');
        
        // Gọi hàm suy ra ký tự từ dữ liệu landmarks
        const recognizedChar = recognizeSignLanguage(handData);
        if (recognizedChar) {
            recognizedSequence += recognizedChar; // Thêm ký tự vào chuỗi
            recognizedTextElement.textContent = recognizedSequence; // Hiển thị chuỗi
        }
    }
}

// Hàm suy ra ký tự từ dữ liệu landmarks
function recognizeSignLanguage(handData) {
    // Ở đây bạn có thể tích hợp mô hình học máy hoặc logic để suy ra ký tự
    // Tạm thời trả về ký tự giả định (ví dụ: 'A' cho mọi cử chỉ)
    return 'A'; // Thay bằng logic nhận diện thực tế
}

// Khởi tạo camera
function initializeCamera() {
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = "Đang khởi tạo camera...";
    camera = new Camera(video, {
        onFrame: async () => {
            if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
                await mediaPipeHands.send({ image: video });
            }
        },
        width: 480,
        height: 360
    });
    try {
        camera.start();
        video.style.display = 'block'; // Hiển thị video khi camera chạy
        if (statusText) statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ...';
    } catch (err) {
        console.error("Lỗi camera: ", err);
        if (statusText) statusText.textContent = 'Lỗi bật webcam. Kiểm tra quyền truy cập.';
    }
}

// Thiết lập sự kiện cho nút "Bật Camera"
startCameraButton.addEventListener('click', () => {
    //initializeMediaPipeHands(); // Khởi tạo MediaPipe Hands
    initializeCamera(); // Khởi tạo camera
});

// Gửi chuỗi ký tự đến chatbot khi bấm nút "Gửi"
sendButton.addEventListener('click', () => {
    const prompt = recognizedSequence.trim();
    if (prompt) {
        fetchOpenAIResponse(prompt)
            .then(response => {
                responseElement.textContent = response; // Hiển thị phản hồi từ chatbot
                recognizedSequence = ''; // Reset chuỗi sau khi gửi
                recognizedTextElement.textContent = ''; // Xóa chuỗi hiển thị
            })
            .catch(err => {
                console.error('Error:', err);
            });
    }
});

// Fetch response từ OpenAI API
async function fetchOpenAIResponse(prompt) {
    const apiKey = 'sk-your-api-key'; // Thay bằng API key của bạn
    const response = await fetch('https://api.openai.com/v1/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'text-davinci-003',
            prompt: prompt,
            max_tokens: 100
        })
    });

    if (!response.ok) {
        throw new Error('Failed to fetch response from OpenAI');
    }

    const data = await response.json();
    return data.choices[0].text.trim();
}

// Hàm chính để khởi tạo khi vào route /chatbot
function main() {
    if (window.location.pathname === '/chatbot') {
        setupInitialUI(); // Thiết lập giao diện ban đầu
        loadTrainingData(); // Tải dữ liệu huấn luyện
        initializeMediaPipeHands(); // Khởi tạo MediaPipe Hands
    }
}

main();