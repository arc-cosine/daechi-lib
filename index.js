// index.js
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// 독후감 저장 파일
const REVIEWS_FILE = path.join(__dirname, 'reviews.json');

// 독후감 데이터 로드/저장 함수
function loadReviews() {
    try {
        if (fs.existsSync(REVIEWS_FILE)) {
            return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('독후감 데이터 로드 실패:', error);
    }
    return [];
}

function saveReviews(reviews) {
    try {
        fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
        return true;
    } catch (error) {
        console.error('독후감 데이터 저장 실패:', error);
        return false;
    }
}

const commonPayload = {
    neisCode: ["B100000749"],
    provCode: "B10",
    schoolName: "서울대치초등학교",
    coverYn: "N",
    facet: "Y"
};

// --- 검색 도서 ---
async function fetchBooks(keyword) {
    const postData = JSON.stringify({ ...commonPayload, searchKeyword: keyword, page: "1", display: "100" });
    const options = {
        hostname: 'read365.edunet.net',
        port: 443,
        path: '/alpasq/api/search',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let rawData = '';
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(rawData);
                    resolve(parsed.data?.bookList || []);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// --- 도서 상세 정보 ---
async function fetchBookDetails(bookKey) {
    const options = {
        hostname: 'read365.edunet.net',
        port: 443,
        path: `/alpasq/api/search/book/state?bookKey=${bookKey}&provCode=${commonPayload.provCode}&neisCode=${commonPayload.neisCode[0]}`,
        method: 'GET'
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let rawData = '';
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(rawData);
                    resolve(parsed);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// --- 인기 도서 ---
async function fetchPopularBooks() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}${mm}${dd}`;

    const options = {
        hostname: 'read365.edunet.net',
        port: 443,
        path: `/dls/api/school/popular?provCode=${commonPayload.provCode}&neisCode=${commonPayload.neisCode[0]}&searchDate=${todayStr}`,
        method: 'GET'
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            let rawData = '';
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(rawData);
                    resolve(parsed.data || []);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// POST 데이터 파싱
function parsePostData(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

// --- 서버 ---
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // HTML 페이지
    if (parsedUrl.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>대치초 도서관</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/html5-qrcode"></script>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Google Analytics 4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?G-ZS92TKDW3Z"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-ZS92TKDW3Z', {
            page_title: '대치초 도서관',
            page_location: window.location.href,
            custom_map: {
                'custom_parameter_1': 'school_library'
            }
        });
        
        // 커스텀 이벤트 추적 함수들
        function trackBookSearch(keyword) {
            gtag('event', 'search', {
                search_term: keyword,
                content_type: 'book'
            });
        }
        
        function trackBookView(bookTitle, bookAuthor) {
            gtag('event', 'view_item', {
                item_name: bookTitle,
                item_category: 'book',
                custom_parameter_author: bookAuthor
            });
        }
        
        function trackBookFavorite(bookTitle, action) {
            gtag('event', action === 'add' ? 'add_to_wishlist' : 'remove_from_wishlist', {
                item_name: bookTitle,
                item_category: 'book'
            });
        }
        
        function trackReviewSubmit(bookTitle) {
            gtag('event', 'submit_review', {
                item_name: bookTitle,
                item_category: 'book_review'
            });
        }
        
        function trackNavigation(sectionName) {
            gtag('event', 'page_view', {
                page_title: sectionName,
                page_location: window.location.href + '#' + sectionName
            });
        }
        
        function trackPopularBooksView() {
            gtag('event', 'view_item_list', {
                item_list_name: 'popular_books',
                item_category: 'book'
            });
        }
    </script>
    
    <style>
        body { font-family: 'Inter', sans-serif; }
        .modal { display:none; position:fixed; z-index:100; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.5); overflow-y:auto; }
        .modal-content {
            background:white;
            margin:5% auto;
            padding:16px;
            border-radius:16px;
            width:95%;
            max-width:500px;
            max-height:80vh;
            overflow-y:auto;
        }
        .section {
            display: none;
        }
        .section.active {
            display: block;
        }
        body { font-family: 'Inter', sans-serif; padding-bottom: 80px; }
        /* 하단 네비게이션 바 스타일 */
        .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: white;
            border-top: 1px solid #e5e7eb;
            padding: 12px 0;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
            z-index: 50;
        }
        .nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            padding: 4px 8px;
            border-radius: 8px;
            margin: 0 4px;
        }
        .nav-item:hover {
            background-color: #f3f4f6;
        }
        .nav-item.active {
            color: #4f46e5;
            background-color: #eef2ff;
        }
        .nav-icon {
            font-size: 20px;
            margin-bottom: 2px;
        }
        .nav-text {
            font-size: 11px;
            font-weight: 500;
        }
        @media (min-width:640px) { /* sm 이상 PC */
            .modal-content { max-width:700px; }
        }
        .close-btn { cursor:pointer; font-size:24px; }
        .sidebar-overlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:200; }
        .sidebar { position:fixed; top:0; left:0; width:80%; max-width:320px; height:100%; background:white; padding:16px; transform:translateX(-100%); transition:transform 0.3s ease; }
        @media (min-width:640px) { .sidebar { max-width:400px; } }
        .sidebar.open { transform:translateX(0); }
        .review-card { transition: transform 0.2s, box-shadow 0.2s; }
        .review-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        
        /* QR 스캐너 스타일 */
        #qr-reader {
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            border-radius: 8px;
            overflow: hidden;
        }
        @media (max-width: 600px) {
            #qr-reader {
                width: 100%;
            }
        }
        
        /* 바코드 중앙 정렬 */
        .barcode-container {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
        }
    </style>
</head>
<body class="bg-gray-100">

<header class="flex items-center justify-center bg-white shadow px-4 py-3 relative">
    <button id="menu-btn" class="text-2xl absolute left-4">☰</button>
    <h1 class="text-lg sm:text-xl font-bold cursor-pointer">대치초 도서관 통합 검색</h1>
</header>

<div id="sidebar-overlay" class="sidebar-overlay">
    <div id="sidebar" class="sidebar">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold">최근 찜한 도서</h2>
            <button id="close-sidebar" class="text-2xl">×</button>
        </div>
        <ul id="recent-favorites" class="space-y-3 text-sm text-gray-700 overflow-y-auto max-h-[70vh]"></ul>
        <div class="mt-4 space-y-2">
            <button id="random-favorite" class="px-4 py-2 bg-indigo-600 text-white rounded-lg w-full">
                랜덤 선택하기 🎲
            </button>
            <button disabled id="library-card-btn" class="px-4 py-2 bg-green-600 text-white rounded-lg w-full">
                대출증 등록
            </button>
        </div>
    </div>
</div>

<main class="p-4 sm:p-6">
    <div id="home-section" class="section active">
        <div class="container bg-white p-4 sm:p-6 rounded-2xl shadow-xl w-full max-w-md sm:max-w-3xl mx-auto">
            <!-- 검색 -->
            <div class="mb-4 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <input id="search-input" type="text" placeholder="검색어 입력 후 Enter"
                       class="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 w-full">
                <button id="search-button" class="bg-indigo-600 text-white px-4 py-3 rounded-lg w-full sm:w-auto">
                    검색
                </button>
            </div>

            <div id="result-count" class="text-sm text-gray-600 mb-3"></div>
            <div id="book-list" class="flex flex-col space-y-4 w-full"></div>
        </div>

        <div class="mt-8 py-4 text-center">
            <p class="text-gray-400 text-sm opacity-50 select-none">
                Made by 한아린 with 
                <strong id="heart" style="cursor:pointer;">❤️</strong>
            </p>
            <p class="text-gray-400 text-sm opacity-50 select-none pointer-events-none">Web Support by <del>Nanaoakari</del> Koyeb.</p>
            <p class="text-gray-400 text-sm opacity-50 select-none pointer-events-none">도서는 최대 100권까지 한번에 조회 가능합니다.</p>
            <p class="text-gray-400 text-sm opacity-50 select-none pointer-events-none">정확하지 않은 정보가 존재할 수 있습니다.</p>
            <p class="text-gray-400 text-sm opacity-50 select-none pointer-events-none">공식 사이트가 아닌, 개인이 만든 사이트입니다.</p>
        </div>
    </div>

    <!-- 윤독도서 화면 -->
    <div id="reading-section" class="section">
        <div class="container bg-white p-4 sm:p-6 rounded-2xl shadow-xl w-full max-w-md sm:max-w-3xl mx-auto">
            <h2 class="text-xl font-bold mb-4">윤독 도서</h2>
            <div class="mb-4">
                <input id="reading-search" type="text" placeholder="윤독 도서 검색..."
                       class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-500">
            </div>
            <div id="reading-list" class="flex flex-col space-y-4">
                <div class="text-center text-gray-500 py-8">
                    <p class="text-lg">📚</p>
                    <p class="mt-2">윤독 도서 목록을 불러오는 중...</p>
                </div>
            </div>
        </div>
    </div>

    <!-- 독후감 화면 -->
    <div id="review-section" class="section">
        <div class="container bg-white p-4 sm:p-6 rounded-2xl shadow-xl w-full max-w-md sm:max-w-3xl mx-auto">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">모든 독후감</h2>
                <div id="review-count" class="text-sm text-gray-600">
                    불러오는 중...
                </div>
            </div>
            <div class="mb-4 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <input id="review-search" type="text" placeholder="독후감 검색 (책 제목, 작성자, 내용)"
                       class="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-purple-500">
                <select id="review-sort" class="p-3 border rounded-lg focus:ring-2 focus:ring-purple-500">
                    <option value="latest">최신순</option>
                    <option value="oldest">오래된순</option>
                    <option value="book">책 제목순</option>
                </select>
            </div>
            <div id="all-reviews-list" class="space-y-4">
                <div class="text-center text-gray-500 py-8">
                    <p class="text-lg">📝</p>
                    <p class="mt-2">독후감을 불러오는 중...</p>
                </div>
            </div>
        </div>
    </div>
</main>

<!-- 모달 -->
<div id="book-modal" class="modal">
    <div class="modal-content">
        <div class="flex justify-between items-center mb-2">
            <h2 class="text-2xl font-bold">도서 상세 정보</h2>
            <div class="flex items-center space-x-3">
                <button id="favorite-btn" class="text-gray-400 text-2xl">♡</button>
                <span id="close-modal" class="close-btn">&times;</span>
            </div>
        </div>
        <div id="modal-details" class="space-y-2 text-sm mb-6"></div>
        
        <!-- 독후감 작성 섹션 -->
        <div class="border-t pt-4">
            <h3 class="text-lg font-bold mb-3">독후감 작성</h3>
            <div class="space-y-3">
                <div>
                    <label class="block text-sm font-medium mb-1">닉네임 (선택)</label>
                    <input id="review-nickname" type="text" placeholder="익명으로 작성하려면 비워두세요" 
                           class="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">독후감</label>
                    <textarea id="review-content" rows="4" placeholder="이 책을 읽고 느낀 점을 자유롭게 써주세요..."
                              class="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                </div>
                <button id="submit-review" class="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">
                    독후감 등록
                </button>
            </div>
        </div>

        <!-- 독후감 목록 -->
        <div class="border-t pt-4 mt-4">
            <h3 class="text-lg font-bold mb-3">독후감 목록</h3>
            <div id="reviews-list" class="space-y-3 max-h-60 overflow-y-auto">
                <p class="text-gray-500 text-center">불러오는 중...</p>
            </div>
        </div>
    </div>
</div>

<!-- 대출증 모달 -->
<div id="library-card-modal" class="modal">
    <div class="modal-content">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold" id="library-card-title">대출증 등록</h2>
            <span id="close-library-card" class="close-btn">&times;</span>
        </div>
        
        <!-- 바코드 스캐너 영역 -->
        <div id="scanner-section">
            <div class="mb-4">
                <p class="text-sm text-gray-600 mb-3">대출증의 바코드를 스캔해주세요</p>
                <div id="qr-reader" style="display:none;"></div>
                <div id="qr-reader-results" class="mt-2 text-sm text-gray-600"></div>
                <button id="start-scan" class="w-full bg-indigo-600 text-white py-3 rounded-lg">
                    📷 바코드 스캔 시작
                </button>
                <button id="stop-scan" class="w-full bg-red-600 text-white py-3 rounded-lg mt-2" style="display:none;">
                    ⏹️ 스캔 중지
                </button>
            </div>
            
            <div class="border-t pt-4">
                <p class="text-sm text-gray-600 mb-2">또는 직접 입력:</p>
                <input id="manual-barcode" type="text" placeholder="바코드 번호를 입력하세요" 
                       class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 mb-3">
                <button id="save-manual" class="w-full bg-indigo-600 text-white py-2 rounded-lg">
                    저장
                </button>
            </div>
        </div>
        
        <!-- 바코드 표시 영역 -->
        <div id="barcode-section" style="display:none;">
            <div class="text-center">
                <p class="text-sm text-gray-600 mb-3">등록된 대출증</p>
                <div id="barcode-display" class="bg-gray-50 p-4 rounded-lg mb-4 barcode-container"></div>
                <p id="barcode-number" class="text-sm font-mono text-gray-700 mb-4"></p>
                <button id="delete-card" class="bg-red-600 text-white px-4 py-2 rounded-lg">
                    대출증 삭제
                </button>
            </div>
        </div>
    </div>
</div>

<script>
    document.addEventListener('DOMContentLoaded', () => {
        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-button');
        const bookList = document.getElementById('book-list');
        const modal = document.getElementById('book-modal');
        const modalDetails = document.getElementById('modal-details');
        const closeModal = document.getElementById('close-modal');
        const favoriteBtn = document.getElementById('favorite-btn');
        const recentFavorites = document.getElementById('recent-favorites');
        const menuBtn = document.getElementById('menu-btn');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const sidebar = document.getElementById('sidebar');
        const closeSidebar = document.getElementById('close-sidebar');
        const resultCount = document.getElementById('result-count');
        const headerTitle = document.querySelector('header h1');
        const reviewNickname = document.getElementById('review-nickname');
        const reviewContent = document.getElementById('review-content');
        const submitReview = document.getElementById('submit-review');
        const reviewsList = document.getElementById('reviews-list');
        const libraryCardBtn = document.getElementById('library-card-btn');
        const libraryCardModal = document.getElementById('library-card-modal');
        const closeLibraryCard = document.getElementById('close-library-card');
        const scannerSection = document.getElementById('scanner-section');
        const barcodeSection = document.getElementById('barcode-section');
        const startScanBtn = document.getElementById('start-scan');
        const stopScanBtn = document.getElementById('stop-scan');
        const manualBarcodeInput = document.getElementById('manual-barcode');
        const saveManualBtn = document.getElementById('save-manual');
        const deleteCardBtn = document.getElementById('delete-card');
        const libraryCardTitle = document.getElementById('library-card-title');
        const barcodeDisplay = document.getElementById('barcode-display');
        const barcodeNumber = document.getElementById('barcode-number');
        const qrReaderResults = document.getElementById('qr-reader-results');
        const allReviewsList = document.getElementById('all-reviews-list');
        const reviewSearch = document.getElementById('review-search');
        const reviewSort = document.getElementById('review-sort');
        const reviewCount = document.getElementById('review-count');
        let html5QrcodeScanner = null;
        let currentBook = null;
        let allReviews = [];

        function getFavorites() { return JSON.parse(localStorage.getItem('favorites') || '[]'); }
        function saveFavorites(favs) { localStorage.setItem('favorites', JSON.stringify(favs)); }
        function getLibraryCard() { return localStorage.getItem('libraryCard'); }
        function saveLibraryCard(cardNumber) { localStorage.setItem('libraryCard', cardNumber); }
        function deleteLibraryCard() { localStorage.removeItem('libraryCard'); }
        
        function updateLibraryCardButton() {
            const cardNumber = getLibraryCard();
            if (cardNumber) {
                libraryCardBtn.textContent = '대출증 조회';
                libraryCardBtn.className = 'px-4 py-2 bg-indigo-600 text-white rounded-lg w-full';
            } else {
                libraryCardBtn.textContent = '대출증 등록';
                libraryCardBtn.className = 'px-4 py-2 bg-indigo-600 text-white rounded-lg w-full';
            }
        }
        
        function showLibraryCardModal() {
            // 사이드바 닫기
            sidebar.classList.remove('open');
            setTimeout(() => sidebarOverlay.style.display = 'none', 300);
            
            const cardNumber = getLibraryCard();
            if (cardNumber) {
                // 대출증이 이미 있는 경우 - 조회 모드
                libraryCardTitle.textContent = '대출증 조회';
                scannerSection.style.display = 'none';
                barcodeSection.style.display = 'block';
                generateBarcode(cardNumber);
                barcodeNumber.textContent = cardNumber;
            } else {
                // 대출증이 없는 경우 - 등록 모드  
                libraryCardTitle.textContent = '대출증 등록';
                scannerSection.style.display = 'block';
                barcodeSection.style.display = 'none';
            }
            libraryCardModal.style.display = 'block';
        }
        
        function generateBarcode(text) {
            barcodeDisplay.innerHTML = '<svg id="barcode"></svg>';
            JsBarcode("#barcode", text, {
                format: "CODE39",
                width: 2,
                height: 100,
                displayValue: false
            });
        }
        
        function startScanner() {
            const qrReader = document.getElementById("qr-reader");
            qrReader.style.display = 'block';
            startScanBtn.style.display = 'none';
            stopScanBtn.style.display = 'block';
            qrReaderResults.innerHTML = '';
            
            // Analytics: 바코드 스캔 시작 추적
            gtag('event', 'barcode_scan_start');
            
            let lastResult, countResults = 0;
            
            html5QrcodeScanner = new Html5QrcodeScanner(
                "qr-reader", 
                { 
                    fps: 10, 
                    qrbox: { width: 300, height: 80 } // 바코드에 적합한 가로로 긴 박스
                },
                false
            );

            function onScanSuccess(decodedText, decodedResult) {
                if (decodedText !== lastResult) {
                    ++countResults;
                    lastResult = decodedText;
                    console.log('Scan result = ' + decodedText, decodedResult);

                    qrReaderResults.innerHTML = '<div class="text-green-600 font-medium">스캔 완료: ' + decodedText + '</div>';

                    // 스캐너 정리
                    html5QrcodeScanner.clear().then(() => {
                        console.log('바코드 스캐너 정리 완료');
                    }).catch((err) => {
                        console.error('스캐너 정리 실패:', err);
                    });

                    // UI 복원
                    qrReader.style.display = 'none';
                    startScanBtn.style.display = 'block';
                    stopScanBtn.style.display = 'none';

                    // 데이터 저장
                    saveLibraryCard(decodedText);
                    updateLibraryCardButton();
                    alert('대출증이 등록되었습니다!');

                    // Analytics: 바코드 스캔 성공 추적
                    gtag('event', 'barcode_scan_success', {
                        scan_method: 'camera'
                    });

                    showLibraryCardModal();
                }
            }

            // Optional callback for error, can be ignored.
            function onScanError(qrCodeError) {
                // This callback would be called in case of qr code scan error or setup error.
                // You can avoid this callback completely, as it can be very verbose in nature.
            }

            try {
                html5QrcodeScanner.render(onScanSuccess, onScanError);
                console.log('바코드 스캐너 시작됨');
            } catch (err) {
                console.error('바코드 스캐너 시작 실패:', err);
                alert('카메라를 시작할 수 없습니다. 브라우저 권한을 확인해주세요.');
                stopScanner();
            }
        }
        
        function stopScanner() {
            if (html5QrcodeScanner) {
                html5QrcodeScanner.clear().then(() => {
                    console.log("바코드 스캐너 정리 완료");
                }).catch((err) => {
                    console.error("스캐너 정리 실패:", err);
                });
                html5QrcodeScanner = null;
            }
            const qrReader = document.getElementById("qr-reader");
            qrReader.style.display = 'none';
            startScanBtn.style.display = 'block';
            stopScanBtn.style.display = 'none';
        }
        
        function updateFavoriteBtn(key) {
            let favs = getFavorites();
            if (favs.find(b => b.bookKey === key)) { 
                favoriteBtn.textContent = '❤️'; 
                favoriteBtn.classList.add('text-red-500'); 
            } else { 
                favoriteBtn.textContent = '🩶'; 
                favoriteBtn.classList.remove('text-red-500'); 
            }
        }

        function renderSidebar() {
            const favs = getFavorites().reverse();
            recentFavorites.innerHTML = '';
            if (favs.length === 0) {
                recentFavorites.innerHTML = '<li class="text-gray-400">없음</li>';
                return;
            }
            favs.forEach(b => {
                const li = document.createElement('li');
                li.className = 'cursor-pointer hover:text-indigo-600';
                li.textContent = b.title;
                li.onclick = () => { 
                    showModal(b); 
                    sidebar.classList.remove('open'); 
                    setTimeout(() => sidebarOverlay.style.display = 'none', 300); 
                };
                recentFavorites.appendChild(li);
            });
        }

        const randomBtn = document.getElementById('random-favorite');
        randomBtn.onclick = () => {
            const favs = getFavorites();
            if (favs.length === 0) {
                alert("찜한 도서가 없습니다!");
                return;
            }
            const randomBook = favs[Math.floor(Math.random() * favs.length)];
            // Analytics: 랜덤 책 선택 추적
            gtag('event', 'random_book_selection', {
                item_name: randomBook.title,
                item_category: 'book'
            });
            showModal(randomBook);
            sidebar.classList.remove('open');
            setTimeout(() => sidebarOverlay.style.display = 'none', 300);
        };

        favoriteBtn.onclick = () => {
            if (!currentBook) return;
            let favs = getFavorites();
            const exists = favs.find(b => b.bookKey === currentBook.bookKey);
            if (exists) {
                favs = favs.filter(b => b.bookKey !== currentBook.bookKey);
                // Analytics: 찜 제거 추적
                trackBookFavorite(currentBook.title, 'remove');
            } else {
                favs.push(currentBook);
                // Analytics: 찜 추가 추적
                trackBookFavorite(currentBook.title, 'add');
            }
            saveFavorites(favs);
            updateFavoriteBtn(currentBook.bookKey);
            renderSidebar();
        };
        
        // 대출증 관련 이벤트 리스너
        libraryCardBtn.onclick = () => {
            // Analytics: 대출증 버튼 클릭 추적
            gtag('event', 'library_card_button_click', {
                has_card: !!getLibraryCard()
            });
            showLibraryCardModal();
        };
        
        closeLibraryCard.onclick = () => {
            libraryCardModal.style.display = 'none';
            stopScanner();
        };
        
        startScanBtn.onclick = startScanner;
        stopScanBtn.onclick = stopScanner;
        
        saveManualBtn.onclick = () => {
            const cardNumber = manualBarcodeInput.value.trim();
            if (!cardNumber) {
                alert('바코드 번호를 입력해주세요.');
                return;
            }
            saveLibraryCard(cardNumber);
            updateLibraryCardButton();
            manualBarcodeInput.value = '';
            alert('대출증이 등록되었습니다!');
            
            // Analytics: 수동 입력으로 대출증 등록 추적
            gtag('event', 'barcode_scan_success', {
                scan_method: 'manual'
            });
            
            showLibraryCardModal();
        };
        
        deleteCardBtn.onclick = () => {
            if (confirm('대출증을 삭제하시겠습니까?')) {
                deleteLibraryCard();
                updateLibraryCardButton();
                libraryCardModal.style.display = 'none';
                alert('대출증이 삭제되었습니다.');
                
                // Analytics: 대출증 삭제 추적
                gtag('event', 'library_card_delete');
            }
        };

        // 독후감 제출
        submitReview.onclick = async () => {
            if (!currentBook) return;
            const content = reviewContent.value.trim();
            if (!content) {
                alert('독후감 내용을 입력해주세요.');
                return;
            }

            const reviewData = {
                bookKey: currentBook.bookKey,
                bookTitle: currentBook.title,
                author: currentBook.author,
                nickname: reviewNickname.value.trim() || '익명',
                content: content,
                timestamp: new Date().toISOString()
            };

            try {
                const response = await fetch('/reviews', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reviewData)
                });
                
                if (response.ok) {
                    alert('독후감이 등록되었습니다!');
                    // Analytics: 독후감 제출 추적
                    trackReviewSubmit(currentBook.title);
                    reviewNickname.value = '';
                    reviewContent.value = '';
                    loadReviews(currentBook.bookKey);
                    // 전체 독후감 목록 새로고침
                    loadAllReviews();
                } else {
                    alert('독후감 등록에 실패했습니다.');
                }
            } catch (error) {
                alert('독후감 등록 중 오류가 발생했습니다.');
            }
        };

        // 독후감 목록 로드
        async function loadReviews(bookKey) {
            try {
                const response = await fetch('/reviews?bookKey=' + bookKey);
                const reviews = await response.json();
                
                if (reviews.length === 0) {
                    reviewsList.innerHTML = '<p class="text-gray-500 text-center">아직 독후감이 없습니다.</p>';
                    return;
                }

                reviewsList.innerHTML = '';
                reviews.forEach(review => {
                    const reviewDiv = document.createElement('div');
                    reviewDiv.className = 'review-card bg-gray-50 p-3 rounded-lg border';
                    
                    const date = new Date(review.timestamp).toLocaleDateString('ko-KR');
                    reviewDiv.innerHTML = '<div class="flex justify-between items-start mb-2">' +
                        '<span class="font-medium text-sm">' + review.nickname + '</span>' +
                        '<span class="text-xs text-gray-500">' + date + '</span>' +
                        '</div>' +
                        '<p class="text-sm text-gray-700 leading-relaxed">' + review.content + '</p>';
                    reviewsList.appendChild(reviewDiv);
                });
            } catch (error) {
                reviewsList.innerHTML = '<p class="text-red-500 text-center">독후감을 불러올 수 없습니다.</p>';
            }
        }

        // 전체 독후감 목록 로드
        async function loadAllReviews() {
            try {
                const response = await fetch('/reviews');
                allReviews = await response.json();
                renderAllReviews();
                updateReviewCount();
            } catch (error) {
                allReviewsList.innerHTML = '<div class="text-center text-red-500 py-8">' +
                    '<p class="text-lg">❌</p>' +
                    '<p class="mt-2">독후감을 불러올 수 없습니다.</p>' +
                    '</div>';
            }
        }

        // 독후감 목록 렌더링
        function renderAllReviews(filteredReviews = null) {
            const reviewsToShow = filteredReviews || allReviews;
            
            if (reviewsToShow.length === 0) {
                if (filteredReviews === null) {
                    allReviewsList.innerHTML = '<div class="text-center text-gray-500 py-8">' +
                        '<p class="text-lg">📝</p>' +
                        '<p class="mt-2">아직 등록된 독후감이 없습니다.</p>' +
                        '<p class="text-sm mt-1">첫 번째 독후감을 작성해보세요!</p>' +
                        '</div>';
                } else {
                    allReviewsList.innerHTML = '<div class="text-center text-gray-500 py-8">' +
                        '<p class="text-lg">🔍</p>' +
                        '<p class="mt-2">검색 결과가 없습니다.</p>' +
                        '</div>';
                }
                return;
            }

            allReviewsList.innerHTML = '';
            reviewsToShow.forEach(review => {
                const reviewDiv = document.createElement('div');
                reviewDiv.className = 'review-card bg-white p-4 rounded-lg border shadow-sm cursor-pointer';
                
                const date = new Date(review.timestamp).toLocaleDateString('ko-KR');
                reviewDiv.innerHTML = '<div class="mb-3">' +
                    '<h3 class="font-semibold text-indigo-600">' + review.bookTitle + '</h3>' +
                    '<p class="text-sm text-gray-600">' + review.author + '</p>' +
                    '</div>' +
                    '<div class="flex justify-between items-start mb-2">' +
                    '<span class="font-medium text-sm">' + review.nickname + '</span>' +
                    '<span class="text-xs text-gray-500">' + date + '</span>' +
                    '</div>' +
                    '<p class="text-sm text-gray-700 leading-relaxed line-clamp-3">' + review.content + '</p>';
                
                // 클릭 시 해당 도서의 상세 정보 모달 열기
                reviewDiv.onclick = async () => {
                    try {
                        // Analytics: 독후감에서 도서 보기 추적
                        gtag('event', 'view_book_from_review', {
                            book_title: review.bookTitle,
                            item_category: 'book'
                        });
                        
                        // 완전한 책 정보 객체 생성 (undefined 방지를 위한 기본값 설정)
                        const bookInfo = {
                            bookKey: review.bookKey,
                            title: review.bookTitle,
                            author: review.author || '저자 정보 없음',
                            publisher: review.publisher || '출판사 정보 없음',
                            isbn: review.isbn || 'ISBN 정보 없음',
                            pubYear: review.pubYear || '',
                            callNo: '',
                            status: '상태 조회 중...',
                            count: 0,
                            returnPlanDate: '',
                            coverYn: 'N',
                            coverUrl: ''
                        };
                        showModal(bookInfo);
                    } catch (error) {
                        console.error('도서 정보 조회 실패:', error);
                        alert('도서 정보를 불러올 수 없습니다.');
                    }
                };
                
                allReviewsList.appendChild(reviewDiv);
            });
        }

        // 독후감 개수 업데이트
        function updateReviewCount() {
    reviewCount.textContent = ""
        }

        // 독후감 검색
        function searchReviews() {
            const searchTerm = reviewSearch.value.toLowerCase().trim();
            if (!searchTerm) {
                renderAllReviews();
                return;
            }

            const filteredReviews = allReviews.filter(review => 
                review.bookTitle.toLowerCase().includes(searchTerm) ||
                review.author.toLowerCase().includes(searchTerm) ||
                review.nickname.toLowerCase().includes(searchTerm) ||
                review.content.toLowerCase().includes(searchTerm)
            );

            // Analytics: 독후감 검색 추적
            gtag('event', 'search_reviews', {
                search_term: searchTerm,
                results_count: filteredReviews.length
            });

            renderAllReviews(filteredReviews);
        }

        // 독후감 정렬
        function sortReviews() {
            const sortType = reviewSort.value;
            let sortedReviews = [...allReviews];

            switch (sortType) {
                case 'latest':
                    sortedReviews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    break;
                case 'oldest':
                    sortedReviews.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                    break;
                case 'book':
                    sortedReviews.sort((a, b) => a.bookTitle.localeCompare(b.bookTitle, 'ko'));
                    break;
            }

            // Analytics: 독후감 정렬 추적
            gtag('event', 'sort_reviews', {
                sort_type: sortType
            });

            renderAllReviews(sortedReviews);
        }

        // 독후감 검색 및 정렬 이벤트 리스너
        reviewSearch.addEventListener('input', searchReviews);
        reviewSort.addEventListener('change', sortReviews);

        closeModal.onclick = () => modal.style.display = 'none';
        
        // 모달 외부 클릭시 닫기
        window.onclick = (e) => { 
            if (e.target === modal) modal.style.display = 'none';
            if (e.target === libraryCardModal) {
                libraryCardModal.style.display = 'none';
                stopScanner();
            }
        };

        window.showModal = async function(book) {
            currentBook = book;
            modal.style.display = 'block';
            modalDetails.innerHTML = '<p>불러오는 중...</p>';
            reviewsList.innerHTML = '<p class="text-gray-500 text-center">불러오는 중...</p>';
            updateFavoriteBtn(book.bookKey);
            
            // Analytics: 도서 상세 보기 추적
            trackBookView(book.title, book.author);
            
            try {
                const res = await fetch('/book-details?bookKey=' + book.bookKey);
                const details = await res.json();
                const combined = { ...book, ...details.data };
                modalDetails.innerHTML = renderBookDetails(combined);
            } catch {
                modalDetails.innerHTML = '<p class="text-red-500">불러오기 실패</p>';
            }

            // 독후감 목록 로드
            loadReviews(book.bookKey);
        };

        function renderBookDetails(book) {
            let coverHtml = '';
            if (book.coverYn === "Y" && book.coverUrl) {
                coverHtml = '<img src="' + book.coverUrl + '" class="w-32 h-40 object-cover rounded mb-2">';
            }

            let statusColor = '';
            const status = book.status || '상태 정보 없음';
            if (status.includes("대출가능")) statusColor = 'text-green-500';
            else if (status.includes("대출중")) statusColor = 'text-red-500';

            let html = coverHtml +
                '<p><strong>제목:</strong> ' + (book.title || '제목 정보 없음') + '</p>' +
                '<p><strong>저자:</strong> ' + (book.author || '저자 정보 없음') + '</p>' +
                '<p><strong>출판사:</strong> ' + (book.publisher || '출판사 정보 없음') + '</p>' +
                '<p><strong>ISBN:</strong> ' + (book.isbn || 'ISBN 정보 없음') + '</p>' +
                '<p><strong>청구기호:</strong> ' + (book.callNo || '검색 기능을 사용하여 조회 가능합니다.') + '</p>' +
                '<p><strong>상태:</strong> <span class="' + statusColor + '">' + status + '</span></p>';

            if (book.pubYear && book.pubYear !== "") html += '<p><strong>출판 연도:</strong> ' + book.pubYear + '</p>';
            if (book.count !== undefined && book.count !== null) html += '<p><strong>권수:</strong> ' + book.count + '</p>';
            if (book.returnPlanDate && book.returnPlanDate !== "") html += '<p><strong>반납 예정일:</strong> ' + book.returnPlanDate + '</p>';

            // 경고 메시지들 (값이 존재할 때만 체크)
            if (book.pubYear === "1999") {
                html += '<p class="text-red-500 mt-2 text-sm">출간 연도가 1999년으로 표기되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
            } else if (book.callNo === "999 999") {
                html += '<p class="text-red-500 mt-2 text-sm">청구 기호가 999 999(임시용 번호)로 표기되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
            } else if (book.callNo && book.callNo.includes("999")) {
                html += '<p class="text-red-500 mt-2 text-sm">청구 기호에 999(임시용 번호)가 포함되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
            } else if (book.callNo && book.callNo.includes("688")) {
                html += '<p class="text-red-500 mt-2 text-sm">청구 기호에 688(임시용 번호)가 포함되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
            }

            return html;
        }

        async function loadPopularBooks() {
            bookList.innerHTML = '<p>불러오는 중...</p>';
            resultCount.textContent = '';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'mb-4';
            headerDiv.innerHTML = '<h2 class="text-xl font-bold mb-1">이런 책은 어때요?</h2>' +
                '<h5 class="text-sm text-gray-500">오늘의 인기 도서!</h5>';
            try {
                const res = await fetch('/popular');
                const books = await res.json();
                bookList.innerHTML = '';
                bookList.appendChild(headerDiv);
                
                // Analytics: 인기 도서 목록 조회 추적
                trackPopularBooksView();
                
                if (books.length === 0) {
                    bookList.innerHTML = '<p>추천 도서 없음</p>';
                    return;
                }
                books.forEach(b => {
                    const div = document.createElement('div');
                    div.className = 'book-item p-4 bg-gray-50 rounded-lg shadow-sm cursor-pointer';
                    div.innerHTML = '<h2 class="font-semibold">' + b.title + '</h2>' +
                              '<p class="text-sm">' + b.author + '</p>' +
                              '<p class="text-xs text-gray-500">상태 불러오는 중...</p>';
                    bookList.appendChild(div);
                    fetch('/book-details?bookKey=' + b.bookKey)
                      .then(res => res.json())
                      .then(details => {
                          const statusP = div.querySelector("p.text-xs");
                          if (details.status === "OK" && details.data && details.data.status) { 
                              statusP.textContent = "상태: " + details.data.status; 
                          } else { 
                              statusP.textContent = "상태: 알 수 없음"; 
                          }
                      }).catch(() => { div.querySelector("p.text-xs").textContent = "상태: 오류"; });
                    div.onclick = () => showModal(b);
                });
            } catch {
                bookList.innerHTML = '<p class="text-red-500">추천 도서 불러오기 실패</p>';
            }
        }

        async function performSearch() {
            const keyword = searchInput.value.trim();
            if (!keyword) return;
            
            // Analytics: 검색 추적
            trackBookSearch(keyword);
            
            bookList.innerHTML = '<p>검색 중...</p>';
            resultCount.textContent = '';
            try {
                const res = await fetch('/books?keyword=' + encodeURIComponent(keyword));
                const books = await res.json();
                bookList.innerHTML = '';
                resultCount.textContent = books.length + '건 검색 결과';
                
                // Analytics: 검색 결과 추적
                gtag('event', 'search_results', {
                    search_term: keyword,
                    results_count: books.length
                });
                
                if (books.length === 0) { 
                    bookList.innerHTML = '<p>검색 결과가 없습니다.</p>'; 
                    return; 
                }
                books.forEach(b => {
                    const div = document.createElement('div');
                    div.className = 'book-item p-4 bg-gray-50 rounded-lg shadow-sm cursor-pointer';
                    div.innerHTML = '<h2 class="font-semibold">' + b.title + '</h2>' +
                                '<p class="text-sm">' + b.author + '</p>' +
                                '<p class="text-xs text-gray-500">상태 불러오는 중...</p>';
                    bookList.appendChild(div);
                    fetch('/book-details?bookKey=' + b.bookKey)
                      .then(res => res.json())
                      .then(details => {
                          const statusP = div.querySelector("p.text-xs");
                          if (details.status === "OK" && details.data && details.data.status) { 
                              statusP.textContent = "상태: " + details.data.status; 
                          } else { 
                              statusP.textContent = "상태: 알 수 없음"; 
                          }
                      }).catch(() => { div.querySelector("p.text-xs").textContent = "상태: 오류"; });
                    div.onclick = () => showModal(b);
                });
            } catch {
                bookList.innerHTML = '<p class="text-red-500">검색 실패</p>';
            }
        }

        searchButton.onclick = performSearch;
        searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') performSearch(); });
        menuBtn.onclick = () => { 
            // Analytics: 사이드바 열기 추적
            gtag('event', 'sidebar_open');
            sidebarOverlay.style.display = 'block'; 
            setTimeout(() => sidebar.classList.add('open'), 10); 
        };
        closeSidebar.onclick = () => { 
            sidebar.classList.remove('open'); 
            setTimeout(() => sidebarOverlay.style.display = 'none', 300); 
        };
        sidebarOverlay.onclick = (e) => { 
            if (e.target === sidebarOverlay) { 
                sidebar.classList.remove('open'); 
                setTimeout(() => sidebarOverlay.style.display = 'none', 300); 
            } 
        };
        headerTitle.onclick = () => { 
            searchInput.value = ''; 
            bookList.innerHTML = ''; 
            resultCount.textContent = ''; 
            // Analytics: 홈으로 돌아가기 추적
            gtag('event', 'home_return');
            loadPopularBooks(); 
        };
        renderSidebar();
        updateLibraryCardButton();
        loadPopularBooks();
        
        // 하트 이스터에그
        const heart = document.getElementById('heart');
        heart.addEventListener('click', () => {
            heart.textContent = '🩶';
            heart.style.color = 'gray';
            // Analytics: 이스터에그 클릭 추적
            gtag('event', 'easter_egg_heart_click');
        });

        // 네비게이션 기능
        const navItems = document.querySelectorAll('.nav-item');
        const sections = document.querySelectorAll('.section');

        console.log('네비게이션 초기화:', navItems.length, sections.length);

        navItems.forEach((item, index) => {
            console.log('네비게이션 아이템 등록:', index, item.dataset.section);
            item.addEventListener('click', (e) => {
                console.log('네비게이션 클릭:', item.dataset.section);
                
                const targetSection = item.dataset.section;
                
                // Analytics: 네비게이션 추적
                trackNavigation(targetSection);
                
                // 모든 네비게이션 아이템에서 active 클래스 제거
                navItems.forEach(nav => nav.classList.remove('active'));
                // 클릭된 아이템에 active 클래스 추가
                item.classList.add('active');
                
                // 모든 섹션 숨기기
                sections.forEach(section => {
                    section.classList.remove('active');
                });
                
                // 선택된 섹션 보이기
                const selectedSection = document.getElementById(targetSection + '-section');
                console.log('선택된 섹션:', selectedSection);
                
                if (selectedSection) {
                    selectedSection.classList.add('active');
                    
                    // 각 섹션별 초기화 로직
                    if (targetSection === 'reading') {
                        const readingList = document.getElementById('reading-list');
                        readingList.innerHTML = '<div class="text-center text-gray-500 py-8">' +
                            '<p class="text-2xl mb-4">📚</p>' +
                            '<p class="text-base font-medium">윤독 도서 기능 준비 중</p>' +
                            '<p class="mt-2 text-sm">학년별, 학급별 필독서 목록을 곧 제공할 예정입니다.</p>' +
                            '</div>';
                    } else if (targetSection === 'review') {
                        // 독후감 섹션 진입 시 독후감 목록 로드
                        loadAllReviews();
                    } else if (targetSection === 'home') {
                        // 홈으로 돌아갈 때 검색 결과가 없으면 인기 도서 로드
                        if (bookList.innerHTML === '' || bookList.innerHTML.includes('준비 중')) {
                            loadPopularBooks();
                        }
                    }
                }
            });
        });
    });
</script>

<!-- 하단 네비게이션 바 -->
<nav class="bottom-nav">
    <div class="flex justify-around items-center h-full">
        <div class="nav-item active" data-section="home">
            <div class="nav-icon">🏠</div>
            <div class="nav-text">홈</div>
        </div>
        <div class="nav-item" data-section="reading">
            <div class="nav-icon">📖</div>
            <div class="nav-text">윤독도서</div>
        </div>
        <div class="nav-item" data-section="review">
            <div class="nav-icon">📝</div>
            <div class="nav-text">독후감</div>
        </div>
    </div>
</nav>

</body>
</html>`;

        res.end(htmlContent);
    }

    // 독후감 조회 API
    else if (parsedUrl.pathname === '/reviews' && req.method === 'GET') {
        const bookKey = parsedUrl.query.bookKey;
        const reviews = loadReviews();
        const bookReviews = bookKey ?
            reviews.filter(r => r.bookKey === bookKey).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) :
            reviews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(bookReviews));
    }

    // 독후감 등록 API
    else if (parsedUrl.pathname === '/reviews' && req.method === 'POST') {
        try {
            const reviewData = await parsePostData(req);
            const reviews = loadReviews();

            // 기본 검증
            if (!reviewData.bookKey || !reviewData.content || !reviewData.bookTitle) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '필수 정보가 누락되었습니다.' }));
                return;
            }

            // 독후감 추가
            reviews.push({
                ...reviewData,
                timestamp: new Date().toISOString()
            });

            if (saveReviews(reviews)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '저장에 실패했습니다.' }));
            }
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '잘못된 요청입니다.' }));
        }
    }

    // --- API: 검색 ---
    else if (parsedUrl.pathname === '/books') {
        const keyword = parsedUrl.query.keyword || '';
        try {
            const books = await fetchBooks(keyword);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(books));
        } catch {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
        }
    }
    // — API: 상세 정보 —
    else if (parsedUrl.pathname === '/book-details') {
        const bookKey = parsedUrl.query.bookKey;
        try {
            const details = await fetchBookDetails(bookKey);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(details));
        } catch {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({}));
        }
    }
    // — API: 인기 도서 —
    else if (parsedUrl.pathname === '/popular') {
        try {
            const books = await fetchPopularBooks();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(books));
        } catch {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
        }
    }
    // — 404 —
    else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(3000, () => console.log("서버 실행: http://localhost:3000"));
