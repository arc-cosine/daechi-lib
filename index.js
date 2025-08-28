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
        .tag { display:inline-flex; align-items:center; background:#e2e8f0; padding:4px 8px; border-radius:12px; margin:2px; }
        .tag button { margin-left:6px; font-weight:bold; cursor:pointer; background:none; border:none; color: #4b5563; }
        .alert { position:fixed; top:16px; left:50%; transform:translateX(-50%); padding:12px 24px; border-radius:8px; z-index:500; opacity:0; transition:opacity 0.3s ease-in-out; }
        /* 모바일 경고창 너비 조정 */
        @media (max-width: 639px) { 
            .alert { width: 90%; }
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
<div class="mt-4 text-center">
  <button id="random-favorite" class="px-4 py-2 bg-indigo-600 text-white rounded-lg w-full">
    랜덤 선택하기 🎲
  </button>
</div>

    </div>
</div>

<main class="p-4 sm:p-6">
<div class="mb-4 flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
    <select id="search-type"
      class="p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto">
        <option value="normal">일반 검색</option>
        <option value="ai">키워드 검색</option>
    </select>
    
    <div class="flex-1">
        <div id="normal-search-container" class="flex flex-1 space-x-2">
            <input id="search-input" type="text" placeholder="검색어 입력 후 Enter" class="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500">
            <button id="search-button" class="bg-indigo-600 text-white px-4 py-3 rounded-lg w-auto">검색</button>
        </div>
        
        <div id="ai-search-container" class="hidden flex-col">
            <div class="flex space-x-2 mb-2">
                <input id="ai-search-input" type="text" placeholder="키워드 입력 후 Enter (최대 5개)" class="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <button id="ai-search-button" class="bg-indigo-600 text-white px-4 py-3 rounded-lg w-auto">검색</button>
            </div>
            <div id="tags" class="flex flex-wrap overflow-y-auto max-h-[100px]"></div>
        </div>
    </div>
</div>

        <div id="result-count" class="text-sm text-gray-600 mb-3"></div>
        <div id="book-list" class="flex flex-col space-y-4 w-full"></div>
    </div>

    <div id="alert-message" class="alert bg-red-100 text-red-700 border border-red-200"></div>

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
        const searchType = document.getElementById('search-type');
        const normalSearchContainer = document.getElementById('normal-search-container');
        const aiSearchContainer = document.getElementById('ai-search-container');
        const aiSearchInput = document.getElementById('ai-search-input');
        const aiSearchButton = document.getElementById('ai-search-button');
        const tagsDiv = document.getElementById('tags');
        const alertMessage = document.getElementById('alert-message');
        let currentBook=null;
        let keywords = [];

        function showAlert(message) {
            alertMessage.textContent = message;
            alertMessage.style.opacity = '1';
            setTimeout(() => {
                alertMessage.style.opacity = '0';
            }, 3000);
        }

        searchType.addEventListener('change', (e) => {
            if (e.target.value === 'ai') {
                normalSearchContainer.classList.add('hidden');
                aiSearchContainer.classList.remove('hidden');
            } else {
                normalSearchContainer.classList.remove('hidden');
                aiSearchContainer.classList.add('hidden');
            }
        });

        function renderTags(){
            tagsDiv.innerHTML='';
            keywords.forEach((kw,i)=>{
                const span=document.createElement('span');
                span.className='tag';
                span.textContent=kw;
                const btn=document.createElement('button');
                btn.textContent='×';
                btn.onclick=()=>{ keywords.splice(i,1); renderTags(); };
                span.appendChild(btn);
                tagsDiv.appendChild(span);
            });
        }

        aiSearchInput.addEventListener('keypress', e=>{
            if(e.key==='Enter'){
                const val=aiSearchInput.value.trim();
                if(val && keywords.length<5){
                    keywords.push(val);
                    aiSearchInput.value='';
                    renderTags();
                } else if(val) {
                    showAlert("키워드는 최대 5개까지 입력할 수 있습니다.");
                }
            }
        });
        
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

    // 🔴 출판년도 경고 메시지
 if (book.pubYear === "1999") {
        html += '<p class="text-red-500 mt-2 text-sm">출판 연도가 1999년(임시용 연도)으로 표기되어 있습니다.<br/>임시용 연도 표기일 경우,<br/>도서관에 없거나 이미 폐기된 책일 수 있습니다.</p>';
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

  async function performNormalSearch() {
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
                  else{ statusP.textContent="상태: 알 수 없음"; }
              }).catch(()=>{ div.querySelector("p.text-xs").textContent="상태: 오류"; });
            div.onclick = ()=>showModal(b);
        });
    } catch {
        bookList.innerHTML='<p class="text-red-500">검색 실패</p>';
    }
  }

  async function performAiSearch() {
    if(keywords.length === 0){
        showAlert("키워드를 입력하세요.");
        return;
    }
    bookList.innerHTML = '<p>검색 중...</p>';
    resultCount.textContent = '';
    try {
        const res = await fetch('/ai-search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ keywords })
        });
        const data = await res.json();
        bookList.innerHTML = '';
        if(data.result === 'GG' || data.result.length === 0){
            bookList.innerHTML = '<p>검색 결과가 없습니다.</p>';
            resultCount.textContent = '0건 검색 결과';
            return;
        }
        
        resultCount.textContent = data.result.length + '건 검색 결과';
        data.result.forEach(b => {
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
        bookList.innerHTML='<p class="text-red-500">정확한 검색 실패</p>';
    }
  }
  
  searchButton.onclick = performNormalSearch;
  searchInput.addEventListener('keypress', e=>{ if(e.key==='Enter') performNormalSearch(); });
  aiSearchButton.onclick = performAiSearch;

  menuBtn.onclick=()=>{ sidebarOverlay.style.display='block'; setTimeout(()=>sidebar.classList.add('open'),10); };
  closeSidebar.onclick=()=>{ sidebar.classList.remove('open'); setTimeout(()=>sidebarOverlay.style.display='none',300); };
  sidebarOverlay.onclick=(e)=>{ if(e.target===sidebarOverlay){ sidebar.classList.remove('open'); setTimeout(()=>sidebarOverlay.style.display='none',300); } };
  headerTitle.onclick=()=>{ 
    searchInput.value=''; 
    aiSearchInput.value='';
    keywords = [];
    renderTags();
    bookList.innerHTML=''; 
    resultCount.textContent=''; 
    loadPopularBooks(); 
  };
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
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(books));
        } catch {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
        }
    }
    else if (parsedUrl.pathname === '/ai-search') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { keywords } = JSON.parse(body);
                if(!keywords || keywords.length === 0){
                    res.writeHead(400); res.end('키워드 없음'); return;
                }

                // 키워드 조합 생성
                const combos = [];
                for(let i=keywords.length;i>0;i--){
                    const perm = getCombinations(keywords, i);
                    combos.push(...perm);
                }

                let allBooks = [];
                for(let combo of combos){
                    const keyword = combo.join(' ');
                    const books = await fetchBooks(keyword);
                    allBooks.push(...books.map(b => ({...b, _combo: keyword})));
                }

                // 유사도 기준 정렬
                allBooks.sort((a,b)=> similarityScore(b.title, keywords) - similarityScore(a.title, keywords));

                const top5 = allBooks.slice(0,5);
                res.writeHead(200, {'Content-Type':'application/json'});
                res.end(JSON.stringify({ result: top5.length ? top5 : 'GG' }));
            } catch(e){
                console.error(e);
                res.writeHead(500);
                res.end(JSON.stringify({ result:'GG' }));
            }
        });
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
function getCombinations(arr, len){
    if(len===1) return arr.map(x=>[x]);
    const result = [];
    arr.forEach((v,i)=>{
        const rest = arr.slice(i+1);
        const combos = getCombinations(rest,len-1);
        combos.forEach(c=>result.push([v,...c]));
    });
    return result;
}

function similarityScore(title, keywords){
    let score=0;
    keywords.forEach(k=>{
        if(title.includes(k)) score++;
    });
    return score;
}

server.listen(3000, () => console.log("서버 실행: http://localhost:3000"));
