// index.js
const http = require('http');
const https = require('https');
const url = require('url');

const commonPayload = {
    neisCode: ["B100000749"],
    provCode: "B10",
    schoolName: "서울대치초등학교",
    coverYn: "N",
    facet: "Y"
};
// 이스터에그용 책
const easterEggBook = {
    bookKey: "1112",
    title: "Who? 나나오아카리",
    author: "한아린",
    publisher: "다산어린이",
    pubYear: "1995",
    callNo: "770 770", // 상세보기 경고용
    ISBN: "770770770770",
    status: "앨범 구매 시 대출 가능",
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
    <style>
        body { font-family: 'Inter', sans-serif; }
        .modal { display:none; position:fixed; z-index:100; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.5); overflow-y:auto; }
        .modal-content {
            background:white;
            margin:5% auto;
            padding:16px;
            border-radius:16px;
            width:95%;
            max-width:400px;
            max-height:80vh;
            overflow-y:auto;
        }
        @media (min-width:640px) { /* sm 이상 PC */
            .modal-content { max-width:600px; }
        }
        .close-btn { cursor:pointer; font-size:24px; }
        .sidebar-overlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:200; }
        .sidebar { position:fixed; top:0; left:0; width:80%; max-width:320px; height:100%; background:white; padding:16px; transform:translateX(-100%); transition:transform 0.3s ease; }
        @media (min-width:640px) { .sidebar { max-width:400px; } }
        .sidebar.open { transform:translateX(0); }
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
        <div id="modal-details" class="space-y-2 text-sm"></div>
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
    showModal(randomBook);
    sidebar.classList.remove('open');
    setTimeout(()=>sidebarOverlay.style.display='none',300);
};

        favoriteBtn.onclick=()=>{
            if(!currentBook) return;
            let favs=getFavorites();
            const exists=favs.find(b=>b.bookKey===currentBook.bookKey);
            if(exists) favs=favs.filter(b=>b.bookKey!==currentBook.bookKey);
            else favs.push(currentBook);
            saveFavorites(favs);
            updateFavoriteBtn(currentBook.bookKey);
            renderSidebar();
        };

        closeModal.onclick=()=>modal.style.display='none';
        window.onclick=(e)=>{ if(e.target===modal) modal.style.display='none'; };

        window.showModal = async function(book) {
            currentBook = book;
            modal.style.display = 'block';
            modalDetails.innerHTML = '<p>불러오는 중...</p>';
            updateFavoriteBtn(book.bookKey);
            try {
                const res = await fetch(\`/book-details?bookKey=\${book.bookKey}\`);
      const details = await res.json();
      const combined = { ...book, ...details.data };
      modalDetails.innerHTML = renderBookDetails(combined);
    } catch {
      modalDetails.innerHTML = '<p class="text-red-500">불러오기 실패</p>';
    }
  };

function renderBookDetails(book) {
    let coverHtml = '';
    if (book.coverYn === "Y" && book.coverUrl) {
        coverHtml = '<img src="' + book.coverUrl + '" class="w-32 h-40 object-cover rounded mb-2">';
    }

    let statusColor = '';
    if (book.status?.includes("대출가능")) statusColor = 'text-green-500';
    else if (book.status?.includes("대출중")) statusColor = 'text-red-500';

    if(book.author == "한아린"){
    coverHtml = '<img src="' + "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTOMIyiG8rYWw0euSokxfCqvHtCVYDH2Fz_9w&s"+ '" class="w-32 h-40 object-cover rounded mb-2">';
    book.status = "앨범 구매 시 대출 가능"
    book.isbn = "19951112770"
    }
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
     
 if (book.pubYear === "1999") {
        html += '<p class="text-red-500 mt-2 text-sm">출간 연도가 1999년으로 표기되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
    }else if (book.callNo === "999 999") {
        html += '<p class="text-red-500 mt-2 text-sm">청구 기호가 999 999(임시용 번호)로 표기되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
    }else if (book.callNo && book.callNo.includes("999")) {
    html += '<p class="text-red-500 mt-2 text-sm">청구 기호에 999(임시용 번호)가 포함되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
}else if (book.callNo && book.callNo.includes("688")) {
    html += '<p class="text-red-500 mt-2 text-sm">청구 기호에 688(임시용 번호)가 포함되어 있습니다.<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
}else if (book.bookKey === "1112") {
        html += '<p class="text-red-500 mt-2 text-sm">본 책은 개발자를 위한 비밀도서 입니다. 도서관에는 존재하지 않아요!</p>';
    }

    return html;
}

  async function loadPopularBooks() {
    bookList.innerHTML = '<p>불러오는 중...</p>';
    resultCount.textContent = '';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'mb-4';
    headerDiv.innerHTML = \`
      <h2 class="text-xl font-bold mb-1">이런 책은 어때요?</h2>
      <h5 class="text-sm text-gray-500">오늘의 인기 도서!</h5>
    \`;
    try {
        const res = await fetch('/popular');
        const books = await res.json();
        bookList.innerHTML = '';
        bookList.appendChild(headerDiv);
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
    bookList.innerHTML = '<p>검색 중...</p>';
    resultCount.textContent = '';
    try {
        const res = await fetch('/books?keyword=' + encodeURIComponent(keyword));
        const books = await res.json();
        bookList.innerHTML = '';
        resultCount.textContent = books.length + '건 검색 결과';
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
                      else if(b.author==="한아린"){ statusP.textContent="상태 : 앨범 구매 시 대출 가능";}
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
  menuBtn.onclick=()=>{ sidebarOverlay.style.display='block'; setTimeout(()=>sidebar.classList.add('open'),10); };
  closeSidebar.onclick=()=>{ sidebar.classList.remove('open'); setTimeout(()=>sidebarOverlay.style.display='none',300); };
  sidebarOverlay.onclick=(e)=>{ if(e.target===sidebarOverlay){ sidebar.classList.remove('open'); setTimeout(()=>sidebarOverlay.style.display='none',300); } };
  headerTitle.onclick=()=>{ searchInput.value=''; bookList.innerHTML=''; resultCount.textContent=''; loadPopularBooks(); };
  renderSidebar();
  loadPopularBooks();
});
  const heart = document.getElementById('heart');
  heart.addEventListener('click', () => {
    heart.textContent = '🩶'; // 회색 하트
    heart.style.color = 'gray';
  });
</script>
</body>
</html>
`);
    }
// --- API: 검색 ---
    else if (parsedUrl.pathname === '/books') {
        const keyword = parsedUrl.query.keyword || '';
        try {
            const books = await fetchBooks(keyword);
            if (keyword && easterEggBook.title.toLowerCase().includes(keyword)) {
                books.unshift(easterEggBook);
            }
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
