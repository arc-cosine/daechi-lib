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
        res.end(`<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>대치초 도서관</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Google Analytics 4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'GA_MEASUREMENT_ID', {
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
<div class="mt-4 text-center">
  <button id="random-favorite" class="px-4 py-2 bg-indigo-600 text-white rounded-lg w-full">
    랜덤 선택하기 🎲
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
    <div id="review-section" class="section hidden">
        <div class="container bg-white p-4 sm:p-6 rounded-2xl shadow-xl w-full max-w-md sm:max-w-3xl mx-auto">
            <h2 class="text-xl font-bold mb-4">모든 독후감</h2>
            <div class="mb-4">
                <input id="review-search" type="text" placeholder="독후감 검색..."
                       class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-purple-500">
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

<script>
    document.addEventListener('DOMContentLoaded', () => {
        const searchInput=document.getElementById('search-input');
        const searchButton=document.getElementById('search-button');
        const bookList=document.getElementById('book-list');
        const modal=document.getElementById('book-modal');
        const modalDetails=document.getElementById('modal-details');
        const closeModal=document.getElementById('close-modal');
        const favoriteBtn=document.getElementById('favorite-btn');
        const recentFavorites=document.getElementById('recent-favorites');
        const menuBtn=document.getElementById('menu-btn');
        const sidebarOverlay=document.getElementById('sidebar-overlay');
        const sidebar=document.getElementById('sidebar');
        const closeSidebar=document.getElementById('close-sidebar');
        const resultCount=document.getElementById('result-count');
        const headerTitle=document.querySelector('header h1');
        const reviewNickname=document.getElementById('review-nickname');
        const reviewContent=document.getElementById('review-content');
        const submitReview=document.getElementById('submit-review');
        const reviewsList=document.getElementById('reviews-list');
        let currentBook=null;

        function getFavorites(){ return JSON.parse(localStorage.getItem('favorites')||'[]'); }
        function saveFavorites(favs){ localStorage.setItem('favorites',JSON.stringify(favs)); }
        function updateFavoriteBtn(key){
            let favs=getFavorites();
            if(favs.find(b=>b.bookKey===key)){ favoriteBtn.textContent='❤️'; favoriteBtn.classList.add('text-red-500'); }
            else{ favoriteBtn.textContent='🩶'; favoriteBtn.classList.remove('text-red-500'); }
        }

        function renderSidebar(){
            const favs = getFavorites().reverse();
            recentFavorites.innerHTML = '';
            if(favs.length === 0){
                recentFavorites.innerHTML = '<li class="text-gray-400">없음</li>';
                return;
            }
            favs.forEach(b=>{
                const li=document.createElement('li');
                li.className='cursor-pointer hover:text-indigo-600';
                li.textContent=b.title;
                li.onclick=()=>{ 
                    showModal(b); 
                    sidebar.classList.remove('open'); 
                    setTimeout(()=>sidebarOverlay.style.display='none',300); 
                };
                recentFavorites.appendChild(li);
            });
        }

        const randomBtn = document.getElementById('random-favorite');
        randomBtn.onclick = () => {
            const favs = getFavorites();
            if(favs.length === 0){
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
            setTimeout(()=>sidebarOverlay.style.display='none',300);
        };

        favoriteBtn.onclick=()=>{
            if(!currentBook) return;
            let favs=getFavorites();
            const exists=favs.find(b=>b.bookKey===currentBook.bookKey);
            if(exists) {
                favs=favs.filter(b=>b.bookKey!==currentBook.bookKey);
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

        // 독후감 제출
        submitReview.onclick = async () => {
            if(!currentBook) return;
            const content = reviewContent.value.trim();
            if(!content) {
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
                
                if(response.ok) {
                    alert('독후감이 등록되었습니다!');
                    // Analytics: 독후감 제출 추적
                    trackReviewSubmit(currentBook.title);
                    reviewNickname.value = '';
                    reviewContent.value = '';
                    loadReviews(currentBook.bookKey);
                } else {
                    alert('독후감 등록에 실패했습니다.');
                }
            } catch(error) {
                alert('독후감 등록 중 오류가 발생했습니다.');
            }
        };

        // 독후감 목록 로드
        async function loadReviews(bookKey) {
            try {
                const response = await fetch(\`/reviews?bookKey=\${bookKey}\`);
                const reviews = await response.json();
                
                if(reviews.length === 0) {
                    reviewsList.innerHTML = '<p class="text-gray-500 text-center">아직 독후감이 없습니다.</p>';
                    return;
                }

                reviewsList.innerHTML = '';
                reviews.forEach(review => {
                    const reviewDiv = document.createElement('div');
                    reviewDiv.className = 'review-card bg-gray-50 p-3 rounded-lg border';
                    
                    const date = new Date(review.timestamp).toLocaleDateString('ko-KR');
                    reviewDiv.innerHTML = \`
                        <div class="flex justify-between items-start mb-2">
                            <span class="font-medium text-sm">\${review.nickname}</span>
                            <span class="text-xs text-gray-500">\${date}</span>
                        </div>
                        <p class="text-sm text-gray-700 leading-relaxed">\${review.content}</p>
                    \`;
                    reviewsList.appendChild(reviewDiv);
                });
            } catch(error) {
                reviewsList.innerHTML = '<p class="text-red-500 text-center">독후감을 불러올 수 없습니다.</p>';
            }
        }

        closeModal.onclick=()=>modal.style.display='none';
        window.onclick=(e)=>{ if(e.target===modal) modal.style.display='none'; };

        window.showModal = async function(book) {
            currentBook = book;
            modal.style.display = 'block';
            modalDetails.innerHTML = '<p>불러오는 중...</p>';
            reviewsList.innerHTML = '<p class="text-gray-500 text-center">불러오는 중...</p>';
            updateFavoriteBtn(book.bookKey);
            
            // Analytics: 도서 상세 보기 추적
            trackBookView(book.title, book.author);
            
            try {
                const res = await fetch(\`/book-details?bookKey=\${book.bookKey}\`);
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
    if (book.status?.includes("대출가능")) statusColor = 'text-green-500';
    else if (book.status?.includes("대출중")) statusColor = 'text-red-500';

    let html = coverHtml
        + '<p><strong>제목:</strong> ' + book.title + '</p>'
        + '<p><strong>저자:</strong> ' + book.author + '</p>'
        + '<p><strong>출판사:</strong> ' + book.publisher + '</p>'
        + '<p><strong>ISBN:</strong> ' + book.isbn + '</p>'
        + '<p><strong>청구기호:</strong> ' + (book.callNo || '검색 기능을 사용하여 조회 가능합니다.') + '</p>'
        + '<p><strong>상태:</strong> <span class="' + statusColor + '">' + book.status + '</span></p>';

    if (book.pubYear !== "") html += '<p><strong>출판 연도:</strong> ' + book.pubYear + '</p>';
    if (book.count !== undefined) html += '<p><strong>권수:</strong> ' + book.count + '</p>';
    if (book.returnPlanDate !== "") html += '<p><strong>반납 예정일:</strong> ' + book.returnPlanDate + '</p>';

    // 경고 메시지들
    if (book.pubYear === "1999") {
        html += '<p class="text-red-500 mt-2 text-sm">출간 연도가 1999년으로 표기되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
    }else if (book.callNo === "999 999") {
        html += '<p class="text-red-500 mt-2 text-sm">청구 기호가 999 999(임시용 번호)로 표기되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
    }else if (book.callNo && book.callNo.includes("999")) {
    html += '<p class="text-red-500 mt-2 text-sm">청구 기호에 999(임시용 번호)가 포함되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
}else if (book.callNo && book.callNo.includes("688")) {
    html += '<p class="text-red-500 mt-2 text-sm">청구 기호에 688(임시용 번호)가 포함되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
}

    return html;
}

  async function loadPopularBooks() {
    bookList.innerHTML = '<p>불러오는 중...</p>';
    resultCount.textContent = '';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'mb-4';
    headerDiv.innerHTML = \`
      <h2 class="text-xl font-bold mb-1">이런 책은 어때요?
      <h5 class="text-sm text-gray-500">오늘의 인기 도서!</h5>
    \`;
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
            div.innerHTML = '<h2 class="font-semibold">' + b.title + '</h2>'
                          + '<p class="text-sm">' + b.author + '</p>'
                          + '<p class="text-xs text-gray-500">상태 불러오는 중...</p>';
            bookList.appendChild(div);
            fetch('/book-details?bookKey=' + b.bookKey)
              .then(res=>res.json())
              .then(details=>{
                  const statusP = div.querySelector("p.text-xs");
                  if(details.status==="OK" && details.data?.status){ statusP.textContent="상태: "+details.data.status; }
                  else{ statusP.textContent="상태: 알 수 없음"; }
              }).catch(()=>{ div.querySelector("p.text-xs").textContent="상태: 오류"; });
            div.onclick = ()=>showModal(b);
        });
    } catch {
        bookList.innerHTML = '<p class="text-red-500">추천 도서 불러오기 실패</p>';
    }
  }

  async function performSearch() {
    const keyword = searchInput.value.trim();
    if(!keyword) return;
    
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
        
        if(books.length===0){ bookList.innerHTML='<p>검색 결과가 없습니다.</p>'; return; }
        books.forEach(b=>{
            const div=document.createElement('div');
            div.className='book-item p-4 bg-gray-50 rounded-lg shadow-sm cursor-pointer';
            div.innerHTML='<h2 class="font-semibold">'+b.title+'</h2>'
                        +'<p class="text-sm">'+b.author+'</p>'
                        +'<p class="text-xs text-gray-500">상태 불러오는 중...</p>';
            bookList.appendChild(div);
            fetch('/book-details?bookKey='+b.bookKey)
              .then(res=>res.json())
              .then(details=>{
                  const statusP = div.querySelector("p.text-xs");
                  if(details.status==="OK" && details.data?.status){ statusP.textContent="상태: "+details.data.status; }
                  else{ statusP.textContent="상태: 알 수 없음"; }
              }).catch(()=>{ div.querySelector("p.text-xs").textContent="상태: 오류"; });
            div.onclick = ()=>showModal(b);
        });
    } catch {
        bookList.innerHTML='<p class="text-red-500">검색 실패</p>';
    }
  }

  searchButton.onclick = performSearch;
  searchInput.addEventListener('keypress', e=>{ if(e.key==='Enter') performSearch(); });
  menuBtn.onclick=()=>{ 
    // Analytics: 사이드바 열기 추적
    gtag('event', 'sidebar_open');
    sidebarOverlay.style.display='block'; 
    setTimeout(()=>sidebar.classList.add('open'),10); 
  };
  closeSidebar.onclick=()=>{ sidebar.classList.remove('open'); setTimeout(()=>sidebarOverlay.style.display='none',300); };
  sidebarOverlay.onclick=(e)=>{ if(e.target===sidebarOverlay){ sidebar.classList.remove('open'); setTimeout(()=>sidebarOverlay.style.display='none',300); } };
  headerTitle.onclick=()=>{ 
    searchInput.value=''; 
    bookList.innerHTML=''; 
    resultCount.textContent=''; 
    // Analytics: 홈으로 돌아가기 추적
    gtag('event', 'home_return');
    loadPopularBooks(); 
  };
  renderSidebar();
  loadPopularBooks();
});
  const heart = document.getElementById('heart');
  heart.addEventListener('click', () => {
    heart.textContent = '🩶';
    heart.style.color = 'gray';
    // Analytics: 이스터에그 클릭 추적
    gtag('event', 'easter_egg_heart_click');
  });
     // 네비게이션 기능 (기존 DOMContentLoaded 이벤트 리스너 맨 끝에 추가)
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');

console.log('네비게이션 초기화:', navItems.length, sections.length); // 디버깅용

navItems.forEach((item, index) => {
    console.log('네비게이션 아이템 등록:', index, item.dataset.section); // 디버깅용
    item.addEventListener('click', (e) => {
        console.log('네비게이션 클릭:', item.dataset.section); // 디버깅용
        
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
        console.log('선택된 섹션:', selectedSection); // 디버깅용
        
        if (selectedSection) {
            selectedSection.classList.add('active');
            
            // 각 섹션별 초기화 로직
            if (targetSection === 'reading') {
                const readingList = document.getElementById('reading-list');
                readingList.innerHTML = \`
                    <div class="text-center text-gray-500 py-8">
                        <p class="text-2xl mb-4">📚</p>
                        <p class="text-base font-medium">윤독 도서 기능 준비 중</p>
                        <p class="mt-2 text-sm">학년별, 학급별 필독서 목록을 곧 제공할 예정입니다.</p>
                    </div>
                \`;
            } else if (targetSection === 'home') {
                // 홈으로 돌아갈 때 검색 결과가 없으면 인기 도서 로드
                if (bookList.innerHTML === '' || bookList.innerHTML.includes('준비 중')) {
                    loadPopularBooks();
                }
            }
        }
    });
});
</script>
<!-- 하단 네비게이션 바 -->
<!-- 하단 네비게이션 바 (</body> 바로 위에 위치) -->
<!--<nav class="bottom-nav">
    <div class="flex justify-center items-center space-x-8">
        <div class="nav-item active" data-section="home">
            <div class="nav-icon">🏠</div>
            <div class="nav-text">홈</div>
        </div>-->
<!--        <div class="nav-item" data-section="reading">
            <div class="nav-icon">📚</div>
            <div class="nav-text">윤독도서</div>
        </div>
    </div>-->
</nav>
</body>
</html>
`);
    }

    // 관리자 페이지
    else if (parsedUrl.pathname === '/admin') {
        const password = parsedUrl.query.password;
        if (password !== '1234') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>관리자 로그인</title>
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Google Analytics 4 for Admin -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'GA_MEASUREMENT_ID');
        
        // 관리자 페이지 접근 시도 추적
        gtag('event', 'admin_access_attempt', {
            page_title: 'Admin Login'
        });
    </script>
</head>
<body class="bg-gray-100 flex items-center justify-center min-h-screen">
    <div class="bg-white p-8 rounded-lg shadow-lg">
        <h1 class="text-2xl font-bold mb-4">관리자 로그인</h1>
        <form method="GET" onsubmit="gtag('event', 'admin_login_attempt');">
            <input type="password" name="password" placeholder="비밀번호" 
                   class="w-full p-3 border rounded mb-4" required>
            <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded">
                로그인
            </button>
        </form>
    </div>
</body>
</html>`);
            return;
        }

        const reviews = loadReviews();
        const reviewsHtml = reviews.map(review => {
            const date = new Date(review.timestamp).toLocaleString('ko-KR');
            return `
            <div class="bg-white p-4 rounded-lg shadow-sm border">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h3 class="font-semibold">${review.bookTitle}</h3>
                        <p class="text-sm text-gray-600">${review.author}</p>
                    </div>
                    <button onclick="deleteReview('${review.timestamp}')" 
                            class="text-red-500 hover:text-red-700 text-sm">삭제</button>
                </div>
                <div class="mb-2">
                    <span class="text-sm font-medium">${review.nickname}</span>
                    <span class="text-xs text-gray-500 ml-2">${date}</span>
                </div>
                <p class="text-sm text-gray-700">${review.content}</p>
            </div>`;
        }).join('');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>관리자 페이지</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Google Analytics 4 for Admin Panel -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'GA_MEASUREMENT_ID');
        
        // 관리자 페이지 성공적 접근 추적
        gtag('event', 'admin_access_success', {
            page_title: 'Admin Panel',
            reviews_count: ${reviews.length}
        });
    </script>
</head>
<body class="bg-gray-100">
    <div class="container mx-auto p-4">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-3xl font-bold">독후감 관리</h1>
            <div class="text-sm text-gray-600">
                총 ${reviews.length}개의 독후감
            </div>
        </div>
        
        <div class="space-y-4">
            ${reviewsHtml || '<p class="text-center text-gray-500 py-8">등록된 독후감이 없습니다.</p>'}
        </div>
    </div>

    <script>
        async function deleteReview(timestamp) {
            if(!confirm('정말 이 독후감을 삭제하시겠습니까?')) return;
            
            // Analytics: 독후감 삭제 시도 추적
            gtag('event', 'admin_delete_review', {
                review_timestamp: timestamp
            });
            
            try {
                const response = await fetch('/admin/delete-review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ timestamp: timestamp })
                });
                
                if(response.ok) {
                    alert('삭제되었습니다.');
                    // Analytics: 독후감 삭제 성공 추적
                    gtag('event', 'admin_delete_success');
                    location.reload();
                } else {
                    alert('삭제에 실패했습니다.');
                    // Analytics: 독후감 삭제 실패 추적
                    gtag('event', 'admin_delete_failure');
                }
            } catch(error) {
                alert('오류가 발생했습니다.');
                gtag('event', 'admin_delete_error');
            }
        }
    </script>
</body>
</html>`);
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

    // 관리자 - 독후감 삭제 API
    else if (parsedUrl.pathname === '/admin/delete-review' && req.method === 'POST') {
        try {
            const { timestamp } = await parsePostData(req);
            const reviews = loadReviews();
            const filteredReviews = reviews.filter(r => r.timestamp !== timestamp);

            if (saveReviews(filteredReviews)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '삭제에 실패했습니다.' }));
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
// — API: 상세 정보 —4
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
