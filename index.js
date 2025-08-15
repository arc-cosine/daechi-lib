const http = require('http');
const https = require('https');
const url = require('url');

// 정적으로 사용되는 API 요청 값들
const commonPayload = {
    "neisCode": ["B100000749"],
    "provCode": "B10",
    "schoolName": "서울대치초등학교",
    "coverYn": "N",
    "facet": "Y"
};

/**
 * 외부 API에 POST 요청을 보내어 도서 목록을 가져오는 함수.
 * async/await 패턴으로 리팩터링하여 코드 가독성을 높였습니다.
 *
 * @param {string} keyword - 검색할 도서명 키워드.
 * @returns {Promise<Array<Object>>} - 도서 목록 배열을 포함하는 Promise.
 */
async function fetchBooks(keyword) {
    const postData = JSON.stringify({ ...commonPayload, "searchKeyword": keyword });

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
            res.on('data', (chunk) => {
                rawData += chunk;
            });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    if (parsedData.data && parsedData.data.bookList) {
                        resolve(parsedData.data.bookList);
                    } else {
                        reject(new Error('데이터 형식이 올바르지 않습니다.'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * 특정 도서의 상세 상태 정보를 가져오는 함수.
 * GET 요청을 사용하여 상태 정보를 조회합니다.
 *
 * @param {string} bookKey - 도서의 고유 키.
 * @returns {Promise<Object>} - 도서 상태 정보를 포함하는 Promise.
 */
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
            res.on('data', (chunk) => {
                rawData += chunk;
            });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    if (parsedData.data) {
                        resolve(parsedData.data);
                    } else {
                        reject(new Error('상세 데이터 형식이 올바르지 않습니다.'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.end();
    });
}

// 웹 서버 생성
const server = http.createServer(async (req, res) => {
    // 요청 URL 파싱
    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === '/') {
        // 메인 페이지 HTML을 전송
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>도서 검색</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
              body { font-family: 'Inter', sans-serif; }
              .modal {
                  display: none;
                  position: fixed;
                  z-index: 100;
                  left: 0;
                  top: 0;
                  width: 100%;
                  height: 100%;
                  overflow: auto;
                  background-color: rgba(0,0,0,0.5);
              }
              .modal-content {
                  position: relative;
                  background-color: white;
                  margin: 5% auto;
                  padding: 24px;
                  border-radius: 12px;
                  width: 90%;
                  max-width: 600px;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                  animation-name: animatetop;
                  animation-duration: 0.4s;
              }
              .close-btn {
                  position: absolute;
                  top: 10px;
                  right: 20px;
                  font-size: 24px;
                  font-weight: bold;
                  cursor: pointer;
              }
              .book-item:hover {
                  background-color: #f3f4f6;
              }
              @keyframes animatetop {
                  from { top: -300px; opacity: 0; }
                  to { top: 0; opacity: 1; }
              }
          </style>
      </head>
      <body class="bg-gray-100 flex flex-col items-center p-8 min-h-screen">
          <div class="container bg-white p-8 rounded-2xl shadow-xl w-full max-w-4xl">
              <h1 class="text-3xl font-bold text-center mb-6 text-gray-800">도서 검색</h1>
              
              <!-- 검색 입력 필드 -->
              <div class="mb-6 flex items-center space-x-2">
                  <input type="text" id="search-input" placeholder="검색어를 입력하고 Enter를 누르세요" 
                         class="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <button id="search-button" class="bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 transition-colors duration-200">검색</button>
              </div>

              <div id="book-list" class="space-y-4">
                  <!-- 도서 목록이 여기에 동적으로 추가됩니다 -->
                  <p class="text-center text-gray-500">검색어를 입력하여 도서를 찾아보세요.</p>
              </div>
          </div>

          <!-- 모달 -->
          <div id="book-modal" class="modal">
              <div class="modal-content">
                  <span id="close-modal" class="close-btn">&times;</span>
                  <div id="modal-details" class="space-y-2">
                      <!-- 도서 상세 정보가 여기에 추가됩니다 -->
                  </div>
              </div>
          </div>

          <script>
            document.addEventListener('DOMContentLoaded', () => {
                const searchInput = document.getElementById('search-input');
                const searchButton = document.getElementById('search-button');
                const bookListDiv = document.getElementById('book-list');
                const modal = document.getElementById('book-modal');
                const modalDetails = document.getElementById('modal-details');
                const closeModalBtn = document.getElementById('close-modal');
                
                // 검색 버튼 클릭 또는 Enter 키 입력 시 검색 실행
                const handleSearch = () => {
                    const keyword = searchInput.value.trim();
                    if (keyword) {
                        fetchBooksFromServer(keyword);
                    } else {
                        bookListDiv.innerHTML = '<p class="text-center text-gray-500">검색어를 입력해주세요.</p>';
                    }
                };

                searchButton.addEventListener('click', handleSearch);
                searchInput.addEventListener('keypress', (event) => {
                    if (event.key === 'Enter') {
                        handleSearch();
                    }
                });

                // 모달 닫기 이벤트
                closeModalBtn.onclick = () => {
                    modal.style.display = 'none';
                };
                window.onclick = (event) => {
                    if (event.target === modal) {
                        modal.style.display = 'none';
                    }
                };
                
                // 모달에 상세 정보 표시하는 함수
                async function showModal(book) {
                    // 로딩 메시지 표시
                    modalDetails.innerHTML = '<p class="text-center text-gray-500">상세 정보를 불러오는 중...</p>';
                    modal.style.display = 'block';

                    try {
                        // 서버에서 상세 정보 가져오기
                        const response = await fetch(\`/book-details?bookKey=\${book.bookKey}\`);
                        if (!response.ok) {
                            throw new Error('상세 정보 네트워크 응답이 실패했습니다.');
                        }
                        const details = await response.json();

                        // 모달 내용 초기화
                        modalDetails.innerHTML = '';
                        
                        // 책 표지 이미지 표시
                        if (details.coverUrl) {
                            const coverImg = document.createElement('img');
                            coverImg.src = details.coverUrl;
                            coverImg.alt = '책 표지';
                            coverImg.className = 'w-1/3 h-auto mx-auto my-4 rounded-lg shadow-md';
                            modalDetails.appendChild(coverImg);
                        }

                        // 상세 정보 항목들 표시
                        const combinedDetails = { ...book, ...details };

                        for (const [key, value] of Object.entries(combinedDetails)) {
                            // 특정 키는 건너뛰기
                            if (['bookKey', 'speciesKey', 'highlightTitle', 'highlightAuthor', 'highlightPublisher', 'coverUrl', 'coverYn'].includes(key)) {
                                continue;
                            }
                            if (typeof value !== 'object' || value === null) {
                                const detailElement = document.createElement('p');
                                detailElement.innerHTML = \`<strong class="text-gray-700">\${key}:</strong> \${value}\`;
                                modalDetails.appendChild(detailElement);
                            } else {
                                // 중첩된 객체 (kdcInfo, categoryInfo 등) 처리
                                const nestedTitle = document.createElement('p');
                                nestedTitle.className = 'font-semibold text-lg mt-4';
                                nestedTitle.textContent = key;
                                modalDetails.appendChild(nestedTitle);
                                for (const [nestedKey, nestedValue] of Object.entries(value)) {
                                    const nestedDetail = document.createElement('p');
                                    nestedDetail.innerHTML = \`<strong class="text-gray-600">\${nestedKey}:</strong> \${nestedValue}\`;
                                    modalDetails.appendChild(nestedDetail);
                                }
                            }
                        }

                    } catch (error) {
                        console.error('상세 정보를 가져오는 중 오류 발생:', error);
                        modalDetails.innerHTML = \`<p class="text-center text-red-500">오류 발생: \${error.message}</p>\`;
                    }
                }

                // 서버에서 도서 목록을 가져오는 함수
                async function fetchBooksFromServer(keyword) {
                    bookListDiv.innerHTML = '<p class="text-center text-gray-500">도서를 불러오는 중...</p>';
                    try {
                        const response = await fetch(\`/books?keyword=\${encodeURIComponent(keyword)}\`);
                        if (!response.ok) {
                            throw new Error('네트워크 응답이 실패했습니다.');
                        }
                        const books = await response.json();
                        
                        bookListDiv.innerHTML = '';
                        if (books.length === 0) {
                            bookListDiv.innerHTML = '<p class="text-center text-gray-500">검색 결과가 없습니다.</p>';
                            return;
                        }

                        books.forEach(book => {
                            const bookItem = document.createElement('div');
                            bookItem.className = 'book-item cursor-pointer p-4 bg-gray-50 rounded-lg shadow-sm transition-colors duration-200';
                            bookItem.innerHTML = \`<h2 class="text-lg font-semibold text-indigo-600">\${book.title}</h2>\`;
                            bookItem.onclick = () => showModal(book);
                            bookListDiv.appendChild(bookItem);
                        });

                    } catch (error) {
                        console.error('도서 정보를 가져오는 중 오류 발생:', error);
                        bookListDiv.innerHTML = \`<p class="text-center text-red-500">오류 발생: \${error.message}</p>\`;
                    }
                }
            });
          </script>
      </body>
      </html>
    `);
    } else if (parsedUrl.pathname === '/books') {
        const keyword = parsedUrl.query.keyword || '';
        if (!keyword) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '검색 키워드가 필요합니다.' }));
            return;
        }

        try {
            const bookList = await fetchBooks(keyword);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(bookList));
        } catch (err) {
            console.error('Failed to fetch books:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch book data' }));
        }
    } else if (parsedUrl.pathname === '/book-details') {
        const bookKey = parsedUrl.query.bookKey;
        if (!bookKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Book key is required.' }));
            return;
        }

        try {
            const details = await fetchBookDetails(bookKey);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(details));
        } catch (err) {
            console.error('Failed to fetch book details:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch book details' }));
        }
    } else {
        // 존재하지 않는 URL 처리
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
