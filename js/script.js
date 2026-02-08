/**
 * 곽슐랭 - 12:20 프리미엄 기능 및 디자인 완전 복구 (통합본)
 */

const KAKAO_JS_KEY = 'd5cd10e600e8a3778f9fde120043696a';
const SUPABASE_URL = 'https://xauiyqsaghmjelkxokcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhdWl5cXNhZ2htamVsa3hva2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNDM0NjcsImV4cCI6MjA4NTkxOTQ2N30.tpLKiZ4dXlhFAP0KJNz4IipZt2s4wvDAZmJpucjYHM4';

let supabaseClient = null;
let allReviews = []; 
let allBookmarks = [];
let allEvents = [];
let currentUser = null;
let activeTheme = null;
let displayLimit = 24; 
let currentMainSort = 'distance';
let currentReviewSort = 'desc'; 
let allRestaurants = [];
let calendarDate = new Date();
let selectedDateStr = "";

const LAT = 37.6317;
const LNG = 127.0775;

// Global Modal Functions
window.openModal = (id) => { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'block'; 
};
window.closeModal = (id) => { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none'; 
};

function init() {
    setupEventListeners();
    setupNavigation();
    updateAuthState(null);

    if (typeof kakao !== 'undefined') {
        kakao.maps.load(() => {
            startApp();
        });
    }
}

async function startApp() {
    try {
        if (typeof window.supabase !== 'undefined') {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            const { data: { session } } = await supabaseClient.auth.getSession();
            await updateAuthState(session);

            supabaseClient.auth.onAuthStateChange(async (_event, session) => {
                await updateAuthState(session);
            });

            await fetchAllReviews();
            await fetchAllBookmarks();
            await fetchAllEvents();
        }
    } catch (e) { console.error("Supabase Error", e); }
    await fetchAllData();
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.onclick = () => {
            const targetView = item.dataset.view;
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            sections.forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(targetView);
            if (targetSection) targetSection.classList.add('active');

            toggleTopBtn(targetView);

            if (targetView === 'profileView') renderProfile();
            if (targetView === 'rouletteView') window.backToGameMain();
            if (targetView === 'calendarView') renderCalendar();
            window.scrollTo(0, 0);
        };
    });
}

function toggleTopBtn(currentView) {
    const topBtn = document.getElementById('topBtn');
    if (!topBtn) return;
    if (currentView === 'homeView' && window.scrollY > 300) {
        topBtn.style.display = 'flex';
    } else {
        topBtn.style.display = 'none';
    }
}

async function fetchAllData() {
    if (!kakao.maps.services) return;
    const ps = new kakao.maps.services.Places();
    const keywords = [
        '한식', '양식', '중식', '일식', '카페', '술집', '분식', '치킨', '고기', '국밥', '파스타', 
        '초밥', '마라탕', '빵', '피자', '햄버거', '라멘', '우동', '소바', '쌀국수', '돈까스',
        '베이커리', '디저트', '포차', '삼겹살', '갈비', '찌개', '전골', '뷔페', '샌드위치', '샐러드'
    ];
    
    const fetchPromises = keywords.map(query => {
        return new Promise(async (resolve) => {
            let combined = [];
            for (let page = 1; page <= 3; page++) {
                const pageData = await new Promise(res => {
                    ps.keywordSearch(query, (data, status) => res(status === kakao.maps.services.Status.OK ? data : []), {
                        location: new kakao.maps.LatLng(LAT, LNG),
                        radius: 3000,
                        page: page
                    });
                });
                combined = combined.concat(pageData);
                if (pageData.length < 15) break; 
            }
            resolve(combined);
        });
    });

    const results = await Promise.all(fetchPromises);
    const unique = Array.from(new Map(results.flat().map(i => [i.id, i])).values());

    allRestaurants = unique.map(item => {
        const restaurantReviews = allReviews.filter(r => r.restaurant_id === item.id);
        const dist = parseInt(item.distance);
        const themeCounts = {};
        restaurantReviews.flatMap(r => r.tags || []).forEach(tag => {
            themeCounts[tag] = (themeCounts[tag] || 0) + 1;
        });

        return {
            id: item.id,
            name: item.place_name,
            category: item.category_name.split(' > ')[1] || '기타',
            fullCategory: item.category_name,
            url: item.place_url,
            distance: dist,
            walkTime: Math.ceil(dist / 67),
            reviewCount: restaurantReviews.length,
            avgRating: restaurantReviews.length > 0 ? parseFloat((restaurantReviews.reduce((s, r) => s + r.rating, 0) / restaurantReviews.length).toFixed(1)) : 0.0,
            themeCounts: themeCounts
        };
    });

    sortAllRestaurants();
    renderView();
}

function sortAllRestaurants() {
    if (currentMainSort === 'distance') allRestaurants.sort((a, b) => a.distance - b.distance);
    else if (currentMainSort === 'rating') allRestaurants.sort((a, b) => b.avgRating - a.avgRating || a.distance - b.distance);
    else if (currentMainSort === 'review') allRestaurants.sort((a, b) => b.reviewCount - a.reviewCount || a.distance - b.distance);
}

function renderView() {
    const grid = document.getElementById('restaurantGrid');
    if (!grid) return;
    const search = document.getElementById('searchInput')?.value.toLowerCase() || "";
    const category = document.querySelector('.cat-btn.active')?.dataset.category || 'all';

    const filtered = allRestaurants.filter(rest => {
        const matchesSearch = rest.name.toLowerCase().includes(search);
        const matchesCat = category === 'all' || rest.fullCategory.includes(category);
        const matchesTheme = !activeTheme || (rest.themeCounts && rest.themeCounts[activeTheme] > 0);
        return matchesSearch && matchesCat && matchesTheme;
    });

    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (loadMoreContainer) {
        const remaining = filtered.length - displayLimit;
        loadMoreContainer.style.display = remaining > 0 ? 'flex' : 'none';
        const btn = loadMoreContainer.querySelector('.load-more-btn');
        if (btn) {
            btn.innerHTML = `더보기 <span class="remaining-count">${remaining}개 남음</span>`;
        }
    }

    grid.innerHTML = filtered.slice(0, displayLimit).map(rest => `
        <div class="card" onclick="window.showDetail('${rest.id}')">
            <span class="card-category">${rest.category}</span>
            <h2 class="card-title">${rest.name}</h2>
            <div class="card-distance">도보 ${rest.walkTime}분</div>
            <div class="card-theme-badges">
                ${Object.entries(rest.themeCounts || {})
                    .filter(([_, count]) => count > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 2)
                    .map(([tag, count]) => `<span class="theme-mini-badge">${tag} ${count}</span>`)
                    .join('')}
            </div>
            <div class="card-rating-info">
                <span class="rating-avg">★ ${rest.avgRating.toFixed(1)}</span>
                <span class="stat-badge">리뷰 ${rest.reviewCount}</span>
            </div>
        </div>
    `).join('');
}

window.loadMore = () => { displayLimit += 24; renderView(); };

window.showDetail = (id) => {
    const rest = allRestaurants.find(r => r.id === id);
    if (!rest) return;
    document.getElementById('detailInfo').dataset.currentId = id;
    document.getElementById('detailInfo').innerHTML = `
        <div class="detail-header" style="text-align:center; margin-bottom:24px;">
            <h2 class="detail-title">${rest.name}</h2>
            <p class="detail-category">${rest.fullCategory}</p>
        </div>
        <a href="${rest.url}" target="_blank" class="kakao-map-link" style="margin-bottom:30px; display: flex; align-items: center; justify-content: center; gap: 8px; background: #fee500; padding: 12px; border-radius: 12px; text-decoration: none; color: #3c1e1e; font-weight: 800;">
            <i class="fas fa-map-marked-alt"></i><span>카카오맵 상세 보기</span>
        </a>
    `;
    updateBookmarkBtn(id);
    renderReviews(id);
    window.openModal('detailModal');
};

async function renderReviews(restaurantId) {
    let restaurantReviews = allReviews.filter(r => r.restaurant_id === restaurantId);
    const reviewList = document.getElementById('reviewList');
    window.sortReviews = (val) => { currentReviewSort = val; renderReviews(restaurantId); };
    
    const tags = ['데이트', '가족과 함께', '혼밥', '친구와', '행사/뒷풀이', '공부'];
    let html = currentUser ? `
        <div class="review-form" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:18px; padding:18px; margin-bottom:20px;">
            <div id="starInput" style="display:flex; justify-content:center; gap:8px; margin-bottom:15px; font-size:1.5rem; color:#cbd5e1; cursor:pointer;">
                ${[1,2,3,4,5].map(i => `<i class="far fa-star" data-value="${i}"></i>`).join('')}
            </div>
            <div class="review-tag-selector" id="reviewTagSelector">
                ${tags.map(t => `<div class="tag-opt" onclick="window.toggleReviewTag(this, '${t}')">${t}</div>`).join('')}
            </div>
            <textarea id="reviewText" placeholder="솔직한 리뷰를 남겨주세요." style="width:100%; height:80px; padding:12px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:12px; resize:none;"></textarea>
            <button onclick="window.submitReview('${restaurantId}')" class="submit-btn" style="width:100%; padding:12px; border-radius:12px; background:#0f172a; color:#fff; font-weight:700;">리뷰 등록</button>
        </div>
    ` : '';

    if (currentReviewSort === 'likes') restaurantReviews.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
    else if (currentReviewSort === 'desc') restaurantReviews.sort((a, b) => b.rating - a.rating);
    else restaurantReviews.sort((a, b) => a.rating - b.rating);

    html += restaurantReviews.map(rev => `
        <div class="review-item" style="padding:15px; border-bottom:1px solid #f1f5f9;">
            <div style="display:flex; justify-content:space-between; align-items: flex-start; margin-bottom: 8px;">
                <div><span style="font-weight:700;">${rev.nickname}</span><div style="color:#f59e0b; font-size:0.8rem;">${'★'.repeat(rev.rating)}</div></div>
                ${(currentUser && (rev.user_id === currentUser.id || currentUser.isAdmin)) ? `<button onclick="window.deleteReview('${rev.id}', '${restaurantId}')" class="rev-action-btn rev-delete-btn"><i class="fas fa-trash-alt"></i></button>` : ''}
            </div>
            <p style="font-size:0.9rem; color:#334155;">${rev.content}</p>
            <div class="review-footer">
                <div class="review-tags" style="display:flex; gap:4px;">
                    ${(rev.tags || []).map(t => `<span style="font-size:0.7rem; color:var(--accent-color); font-weight:700;">#${t}</span>`).join('')}
                </div>
                <div class="review-actions">
                    <button onclick="window.likeReview('${rev.id}', '${restaurantId}')" class="rev-action-btn ${rev.likes?.includes(currentUser?.id) ? 'liked' : ''}">
                        <i class="fa${rev.likes?.includes(currentUser?.id) ? 's' : 'r'} fa-thumbs-up"></i>
                        <span>${rev.likes?.length || 0}</span>
                    </button>
                </div>
            </div>
        </div>
    `).join('') || '<p style="text-align:center; padding:20px;">첫 리뷰를 기다리고 있어요!</p>';
    reviewList.innerHTML = html;
    if (currentUser) window.setupStarRating();
}

window.toggleReviewTag = (el, tag) => {
    const container = document.getElementById('reviewTagSelector');
    const activeTags = container.querySelectorAll('.tag-opt.active');
    if (!el.classList.contains('active') && activeTags.length >= 2) return alert('테마는 최대 2개까지만 선택 가능합니다.');
    el.classList.toggle('active');
};

window.likeReview = async (reviewId, restaurantId) => {
    if (!currentUser) return alert('로그인 후 추천할 수 있습니다.');
    const review = allReviews.find(r => r.id === reviewId);
    let newLikes = review.likes || [];
    if (newLikes.includes(currentUser.id)) newLikes = newLikes.filter(id => id !== currentUser.id);
    else newLikes.push(currentUser.id);
    await supabaseClient.from('reviews').update({ likes: newLikes }).eq('id', reviewId);
    await fetchAllReviews(); renderReviews(restaurantId);
};

window.deleteReview = async (reviewId, restaurantId) => {
    if (!confirm('정말 리뷰를 삭제하시겠습니까?')) return;
    await supabaseClient.from('reviews').delete().eq('id', reviewId);
    await fetchAllReviews(); renderReviews(restaurantId);
};

window.setupStarRating = () => {
    const stars = document.querySelectorAll('#starInput i');
    stars.forEach(star => {
        star.onclick = () => {
            const val = parseInt(star.dataset.value);
            document.getElementById('starInput').dataset.rating = val;
            stars.forEach((s, i) => {
                s.classList.replace(i < val ? 'far' : 'fas', i < val ? 'fas' : 'far');
                s.style.color = i < val ? '#f59e0b' : '#cbd5e1';
            });
        };
    });
};

window.submitReview = async (restaurantId) => {
    const rating = parseInt(document.getElementById('starInput').dataset.rating || 0);
    const content = document.getElementById('reviewText').value.trim();
    const tags = Array.from(document.querySelectorAll('#reviewTagSelector .tag-opt.active')).map(el => el.innerText);
    if (!rating || !content) return alert('평점과 내용을 입력해주세요.');
    const { data: profile } = await supabaseClient.from('profiles').select('nickname').eq('id', currentUser.id).single();
    try {
        await supabaseClient.from('reviews').insert({ restaurant_id: restaurantId, user_id: currentUser.id, nickname: profile.nickname, rating, content, tags });
        alert('리뷰 등록 완료!'); await fetchAllReviews(); await fetchAllData(); renderReviews(restaurantId);
    } catch (e) { console.error(e); }
};

window.toggleBookmark = async () => {
    if (!currentUser) return alert('로그인 후 이용 가능합니다.');
    const id = document.getElementById('detailInfo').dataset.currentId;
    const isBookmarked = allBookmarks.some(b => b.restaurant_id === id);
    if (isBookmarked) await supabaseClient.from('bookmarks').delete().eq('user_id', currentUser.id).eq('restaurant_id', id);
    else await supabaseClient.from('bookmarks').insert({ user_id: currentUser.id, restaurant_id: id });
    await fetchAllBookmarks(); updateBookmarkBtn(id);
};

function updateBookmarkBtn(id) {
    const isBookmarked = allBookmarks.some(b => b.restaurant_id === id);
    const btn = document.getElementById('bookmarkBtn');
    if (btn) btn.innerHTML = isBookmarked ? '<i class="fas fa-bookmark" style="color:#ef4444;"></i>' : '<i class="far fa-bookmark"></i>';
}

// --- [게임] ---
window.openGame = (gameId) => {
    document.getElementById('rouletteMain').style.display = 'none';
    document.querySelectorAll('.game-subview').forEach(v => v.style.display = 'none');
    document.getElementById('game-' + gameId).style.display = 'block';
    if (gameId === 'makeWheel') initWheelInputs();
};

window.backToGameMain = () => {
    document.getElementById('rouletteMain').style.display = 'grid';
    document.querySelectorAll('.game-subview').forEach(v => v.style.display = 'none');
};

function initWheelInputs() {
    const container = document.getElementById('wheelInputs');
    if (!container.innerHTML.trim()) {
        let html = '';
        for (let i = 0; i < 8; i++) html += `<input type="text" class="wheel-item-input" placeholder="메뉴 입력 ${i+1}" oninput="window.drawWheel()">`;
        container.innerHTML = html;
    }
    setTimeout(() => window.drawWheel(), 100);
}

window.drawWheel = () => {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const inputs = document.querySelectorAll('.wheel-item-input');
    const items = Array.from(inputs).map(i => i.value || `항목 ${Array.from(inputs).indexOf(i)+1}`);
    const centerX = 150; const centerY = 150; const radius = 150;
    const sliceAngle = (2 * Math.PI) / 8;
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#2dd4bf', '#3b82f6', '#818cf8'];
    ctx.clearRect(0, 0, 300, 300);
    items.forEach((item, i) => {
        const angle = i * sliceAngle;
        ctx.beginPath(); ctx.fillStyle = colors[i]; ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, angle, angle + sliceAngle); ctx.fill();
        ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(angle + sliceAngle / 2);
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Pretendard';
        ctx.fillText(item.substring(0, 5), radius / 1.5, 5); ctx.restore();
    });
};

let isSpinning = false;
window.setupRouletteSpin = () => {
    const btn = document.getElementById('spinWheelBtn');
    if (!btn) return;
    btn.onclick = () => window.startSpinWheel();
};

window.startSpinWheel = () => {
    if (isSpinning) return;
    const inputs = document.querySelectorAll('.wheel-item-input');
    const items = Array.from(inputs).map(i => i.value || `항목 ${Array.from(inputs).indexOf(i)+1}`);
    const visualArea = document.getElementById('wheelVisualArea');
    const spinBtn = document.getElementById('spinWheelBtn');
    const canvas = document.getElementById('wheelCanvas');
    visualArea.style.display = 'block'; spinBtn.style.display = 'none';
    document.getElementById('wheelResultWrapper').style.display = 'none';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            isSpinning = true;
            const randomRotation = Math.floor(Math.random() * 360) + 7200; 
            canvas.style.transform = `rotate(${randomRotation}deg)`;
            setTimeout(() => {
                isSpinning = false;
                const winningIndex = Math.floor(((360 - (randomRotation % 360) + 360) % 360) / (360 / 8));
                const winner = items[winningIndex];
                const wrapper = document.getElementById('wheelResultWrapper');
                wrapper.style.display = 'block';
                wrapper.innerHTML = `
                    <div style="font-size:1.2rem; font-weight:900; color:#f43f5e; margin-bottom:5px;">🎊 오늘의 당첨 메뉴! 🎊</div>
                    <div style="font-size:1.8rem; font-weight:900; color:#0f172a; margin-bottom:15px;">"${winner}"</div>
                    <button onclick="window.resetWheel()" class="premium-spin-btn re-spin-btn">🔄 다시 돌리기</button>
                `;
            }, 6000);
        });
    });
};

window.resetWheel = () => {
    const canvas = document.getElementById('wheelCanvas');
    canvas.style.transition = 'none'; canvas.style.transform = 'rotate(0deg)';
    setTimeout(() => { canvas.style.transition = 'transform 6s cubic-bezier(0.1, 0, 0.1, 1)'; }, 50);
    document.getElementById('wheelResultWrapper').style.display = 'none';
    document.getElementById('spinWheelBtn').style.display = 'block';
};

window.playRPS = () => {
    const resDiv = document.getElementById('rpsResult');
    const options = ['<i class="fas fa-hand-fist"></i>', '<i class="fas fa-hand-scissors"></i>', '<i class="fas fa-hand"></i>'];
    let count = 0;
    const interval = setInterval(() => {
        resDiv.innerHTML = options[count % 3]; count++;
        if (count > 20) { clearInterval(interval); resDiv.innerHTML = options[Math.floor(Math.random() * 3)]; }
    }, 80);
};

window.spinSoju = () => {
    const bottle = document.getElementById('sojuBottle');
    const result = document.getElementById('sojuResult');
    result.style.display = 'none';
    const randomDegree = Math.floor(Math.random() * 360) + 3600;
    bottle.style.transform = `rotate(${randomDegree}deg)`;
    setTimeout(() => { result.style.display = 'block'; }, 10000);
};

// --- [프로필 & 캘린더] ---
window.switchProfileTab = (tab) => {
    document.querySelectorAll('.profile-tab-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick').includes(tab)));
    if (tab === 'bookmarks') renderProfileBookmarks();
    else renderProfileReviews();
};

async function renderProfile() {
    const container = document.getElementById('profileContent');
    if (!currentUser) { container.innerHTML = `<div style="padding:100px 20px; text-align:center;"><h2>로그인이 필요합니다</h2></div>`; return; }
    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    document.getElementById('profileUserArea').innerHTML = `
        <div class="profile-nickname-area">
            <div class="nickname-display">${profile?.nickname || '회원'} 학우님</div>
            <div class="nickname-edit-box">
                <input type="text" id="newNickname" class="nickname-input" placeholder="새 닉네임 입력" value="${profile?.nickname || ''}">
                <button onclick="window.updateNickname()" class="nick-save-btn">수정</button>
            </div>
            <div id="nickEditMsg" class="nick-error-msg" style="display:none;"></div>
        </div>
    `;
    window.switchProfileTab('bookmarks');
}

async function renderProfileBookmarks() {
    const content = document.getElementById('profileTabContent');
    if (allBookmarks.length === 0) { content.innerHTML = '<p style="text-align:center; padding:40px; color:#94a3b8;">저장한 식당이 없습니다.</p>'; return; }
    let html = '';
    for (const b of allBookmarks) {
        const rest = allRestaurants.find(r => r.id === b.restaurant_id);
        if (!rest) continue;
        html += `
            <div class="profile-item-card">
                <div class="p-item-info"><h4>${rest.name}</h4><p>${rest.category} · 도보 ${rest.walkTime}분</p></div>
                <div style="display:flex; gap:8px;">
                    <button onclick="window.showDetail('${rest.id}')" class="p-action-btn p-go-btn"><i class="fas fa-chevron-right"></i></button>
                    <button onclick="window.toggleBookmarkFromProfile('${rest.id}')" class="p-action-btn p-delete-btn"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `;
    }
    content.innerHTML = html || '<p style="text-align:center; padding:40px; color:#94a3b8;">저장한 식당이 없습니다.</p>';
}

window.toggleBookmarkFromProfile = async (id) => { await window.toggleBookmark(id); renderProfileBookmarks(); };

async function renderProfileReviews() {
    const content = document.getElementById('profileTabContent');
    const myReviews = allReviews.filter(r => r.user_id === currentUser.id);
    if (myReviews.length === 0) { content.innerHTML = '<p style="text-align:center; padding:40px; color:#94a3b8;">작성한 리뷰가 없습니다.</p>'; return; }
    content.innerHTML = myReviews.map(rev => {
        const rest = allRestaurants.find(r => r.id === rev.restaurant_id);
        return `
            <div class="profile-item-card">
                <div class="p-item-info">
                    <h4>${rest?.name || '삭제된 식당'}</h4>
                    <p style="color:var(--star-color); font-weight:800; margin-bottom:4px;">${'★'.repeat(rev.rating)}</p>
                    <p>${rev.content}</p>
                </div>
                <button onclick="window.deleteReviewFromProfile('${rev.id}', '${rev.restaurant_id}')" class="p-action-btn p-delete-btn"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
    }).join('');
}

window.deleteReviewFromProfile = async (reviewId, restaurantId) => { await window.deleteReview(reviewId, restaurantId); renderProfileReviews(); };

window.updateNickname = async () => {
    const newNick = document.getElementById('newNickname').value.trim();
    const msg = document.getElementById('nickEditMsg');
    if (!newNick) return;
    const { data: existing } = await supabaseClient.from('profiles').select('id').eq('nickname', newNick).neq('id', currentUser.id).maybeSingle();
    if (existing) { msg.innerText = '이미 사용 중인 닉네임입니다.'; msg.style.display = 'block'; return; }
    const { error } = await supabaseClient.from('profiles').update({ nickname: newNick }).eq('id', currentUser.id);
    if (error) alert('수정 실패'); else { alert('닉네임이 수정되었습니다!'); renderProfile(); updateAuthState({ user: currentUser }); }
};

function renderCalendar() {
    const header = document.getElementById('calendarHeader');
    const grid = document.getElementById('calendarGrid');
    if (!header || !grid) return;
    const year = calendarDate.getFullYear(); const month = calendarDate.getMonth();
    header.innerHTML = `
        <button class="calendar-nav-btn" onclick="window.changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>
        <h2 style="font-size:1.2rem; font-weight:900;">${year}년 ${month + 1}월</h2>
        <button class="calendar-nav-btn" onclick="window.changeMonth(1)"><i class="fas fa-chevron-right"></i></button>
    `;
    const firstDay = new Date(year, month, 1).getDay(); const lastDate = new Date(year, month + 1, 0).getDate();
    let html = ''; ['일','월','화','수','목','금','토'].forEach(d => html += `<div class="calendar-day-label">${d}</div>`);
    for (let i = 0; i < firstDay; i++) html += `<div class="calendar-day other-month"></div>`;
    const today = new Date();
    for (let i = 1; i <= lastDate; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === i;
        const isSelected = selectedDateStr === dateStr;
        const dayOfWeek = new Date(year, month, i).getDay();
        const dayEvents = allEvents.filter(e => {
            if (e.event_date === dateStr) return true;
            if (e.repeat_weekly) {
                const eventStart = new Date(e.event_date); const currentDay = new Date(year, month, i);
                return eventStart.getDay() === dayOfWeek && eventStart <= currentDay;
            }
            return false;
        });
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="window.selectDate('${dateStr}')">
                <span class="day-num">${i}</span>
                <div class="event-dots">${dayEvents.slice(0, 3).map(e => `<div class="dot" style="background:${e.color}"></div>`).join('')}</div>
            </div>`;
    }
    grid.innerHTML = html; renderEventsForDate();
}

window.changeMonth = (diff) => { calendarDate.setMonth(calendarDate.getMonth() + diff); renderCalendar(); };
window.selectDate = (dateStr) => { selectedDateStr = dateStr; renderCalendar(); };

function renderEventsForDate() {
    const list = document.getElementById('eventList');
    if (!list) return;
    if (!selectedDateStr) { list.innerHTML = '<div style="text-align:center; padding:40px 20px;"><p style="color:#94a3b8; font-size:0.9rem; font-weight:700;">📅 날짜를 선택하여 일정을 확인하세요!</p></div>'; return; }
    const selectedDate = new Date(selectedDateStr); const dayOfWeek = selectedDate.getDay();
    const dayEvents = allEvents.filter(e => {
        if (e.event_date === selectedDateStr) return true;
        if (e.repeat_weekly) { const eventStart = new Date(e.event_date); return eventStart.getDay() === dayOfWeek && eventStart <= selectedDate; }
        return false;
    });
    let html = `<div class="event-list-header"><h3 style="font-size:1.2rem; font-weight:950; color:#0f172a;">${selectedDateStr}</h3><button class="add-event-btn" onclick="window.openEventModal()">+ 일정추가</button></div>`;
    if (dayEvents.length === 0) html += `<div style="text-align:center; padding:50px 20px; background:#fff; border-radius:28px; border:2px dashed #f1f5f9;"><p style="color:#94a3b8; font-size:0.85rem; font-weight:700;">등록된 일정이 없어요.</p></div>`;
    else html += dayEvents.map(e => `<div class="event-card"><div class="event-color-bar" style="background:${e.color}"></div><div class="event-info"><h4>${e.title}</h4>${e.memo ? `<p>${e.memo}</p>` : ''}${e.repeat_weekly ? `<span class="event-repeat-badge"><i class="fas fa-redo-alt"></i> 매주 반복</span>` : ''}</div><button onclick="window.deleteEvent('${e.id}')" class="delete-event-btn"><i class="fas fa-trash-alt"></i></button></div>`).join('');
    list.innerHTML = html;
}

window.openEventModal = () => {
    if (!currentUser) return alert('로그인 후 이용할 수 있습니다.'); if (!selectedDateStr) return alert('날짜를 먼저 선택해주세요!');
    document.getElementById('eventModalTitle').innerText = `${selectedDateStr} 일정 추가`;
    document.getElementById('eventTitle').value = ''; document.getElementById('eventMemo').value = ''; document.getElementById('eventRepeat').checked = false;
    document.querySelectorAll('.color-opt').forEach(opt => opt.classList.remove('active'));
    document.querySelector('.color-opt[data-color="#3b82f6"]').classList.add('active');
    window.openModal('eventModal');
};

window.saveEvent = async () => {
    const title = document.getElementById('eventTitle').value.trim();
    const memo = document.getElementById('eventMemo').value.trim();
    const repeat = document.getElementById('eventRepeat').checked;
    const color = document.querySelector('.color-opt.active')?.dataset.color || '#3b82f6';
    if (!title) return alert('일정 제목을 입력해주세요!');
    try {
        const { error } = await supabaseClient.from('events').insert({ user_id: currentUser.id, title, memo, color, event_date: selectedDateStr, repeat_weekly: repeat });
        if (error) throw error; alert('🎉 일정이 등록되었습니다!'); window.closeModal('eventModal');
        await fetchAllEvents(); renderCalendar();
    } catch (e) { alert('저장 실패: ' + e.message); }
};

window.deleteEvent = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
        const { error } = await supabaseClient.from('events').delete().eq('id', id);
        if (error) throw error; await fetchAllEvents(); renderCalendar();
    } catch (e) { alert('삭제 실패: ' + e.message); }
};

window.setupColorPicker = () => {
    document.querySelectorAll('.color-opt').forEach(opt => {
        opt.onclick = () => { document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('active')); opt.classList.add('active'); };
    });
};
window.setupColorPicker();

async function updateAuthState(session) {
    currentUser = session?.user || null; const authStatus = document.getElementById('authStatus');
    if (currentUser) {
        const { data: profile } = await supabaseClient.from('profiles').select('nickname, is_admin').eq('id', currentUser.id).single();
        if (profile) currentUser.isAdmin = profile.is_admin;
        authStatus.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:0.8rem; font-weight:900;">${profile?.nickname || '회원'}</span><button onclick="window.handleLogout()" class="auth-btn">로그아웃</button></div>`;
        if (typeof checkPwaGuide === 'function') setTimeout(checkPwaGuide, 800);
    } else authStatus.innerHTML = `<button onclick="window.openModal('loginModal')" class="auth-btn">로그인</button><button onclick="window.openModal('signupModal')" class="auth-btn signup">회원가입</button>`;
}

window.handleSignup = async () => {
    const id = document.getElementById('signupId').value.trim();
    const pw = document.getElementById('signupPw').value.trim();
    const nickname = document.getElementById('signupNickname').value.trim();
    if (!id || !pw || !nickname) return alert('모든 항목을 입력해주세요.');
    try {
        const { data, error } = await supabaseClient.auth.signUp({ email: `${id}@dummy.com`, password: pw });
        if (error) throw error;
        if (data.user) {
            const { error: profileError } = await supabaseClient.from('profiles').insert([{ id: data.user.id, nickname: nickname }]);
            if (profileError) throw profileError;
            alert('회원가입 성공! 이제 로그인해주세요.');
            closeModal('signupModal');
        }
    } catch (e) { alert('회원가입 실패: ' + e.message); }
};

window.handleLogin = async () => {
    const id = document.getElementById('loginId').value; const pw = document.getElementById('loginPw').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email: `${id}@dummy.com`, password: pw });
    if (error) alert('로그인 실패'); 
    else {
        closeModal('loginModal');
        if (typeof checkPwaGuide === 'function') setTimeout(checkPwaGuide, 500);
    }
};

window.handleLogout = async () => { await supabaseClient.auth.signOut(); location.reload(); };

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.oninput = () => renderView();
    document.querySelectorAll('.cat-btn').forEach(btn => btn.onclick = () => {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); renderView();
    });
    document.querySelectorAll('.sort-btn').forEach(btn => btn.onclick = () => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); currentMainSort = btn.dataset.sort; sortAllRestaurants(); renderView();
    });
    document.querySelectorAll('.theme-btn').forEach(btn => btn.onclick = () => {
        const theme = btn.dataset.tag; activeTheme = (activeTheme === theme) ? null : theme;
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.tag === activeTheme));
        document.getElementById('activeThemeBadge').style.display = activeTheme ? 'flex' : 'none';
        document.getElementById('selectedThemeName').innerText = activeTheme || ''; renderView();
    });
    document.getElementById('clearThemeBtn').onclick = () => {
        activeTheme = null; document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('activeThemeBadge').style.display = 'none'; renderView();
    };
    const themeBtn = document.getElementById('themeToggleBtn'); const themeList = document.getElementById('themeList');
    if (themeBtn) themeBtn.onclick = () => themeList.style.display = themeList.style.display === 'none' ? 'flex' : 'none';
    window.onscroll = () => { const currentView = document.querySelector('.nav-item.active').dataset.view; toggleTopBtn(currentView); };
    window.setupRouletteSpin(); setupGameCategoryFilters(); window.setupMagicRecommend();
}

function setupGameCategoryFilters() {
    const btns = document.querySelectorAll('.rec-cat-btn');
    btns.forEach(btn => btn.onclick = (e) => { e.stopPropagation(); btns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); });
}

window.setupMagicRecommend = () => {
    const btn = document.getElementById('recSpinBtn'); const resDiv = document.getElementById('recResult');
    if (!btn || !resDiv) return;
    btn.onclick = () => {
        const category = document.querySelector('.rec-cat-btn.active')?.dataset.cat || 'all';
        const filtered = allRestaurants.filter(r => category === 'all' || r.fullCategory.includes(category));
        if (filtered.length === 0) return alert('해당 카테고리의 식당이 없습니다!');
        btn.disabled = true; resDiv.classList.add('magic-shaking');
        let rollingCount = 0;
        const rollingInterval = setInterval(() => {
            const tempPicked = filtered[Math.floor(Math.random() * filtered.length)]; resDiv.innerText = tempPicked.name;
            rollingCount++; if (rollingCount > 20) { clearInterval(rollingInterval); finishMagicRecommend(filtered, btn, resDiv); }
        }, 80);
    };
};

function finishMagicRecommend(filtered, btn, resDiv) {
    const picked = filtered[Math.floor(Math.random() * filtered.length)];
    resDiv.classList.remove('magic-shaking'); resDiv.innerHTML = `<div style="animation: popIn 0.5s both;">${picked.name}</div>`;
    const detail = document.getElementById('recDetail'); detail.style.display = 'block';
    detail.innerHTML = `<div style="font-size:0.85rem; color:#475569; margin-bottom:8px;">📍 ${picked.category} · 도보 ${picked.walkTime}분</div><button onclick="window.showDetail('${picked.id}')" style="background:var(--primary-color); color:#fff; border:none; padding:8px 16px; border-radius:10px; font-size:0.8rem; font-weight:800; cursor:pointer;">상세 정보 보기</button>`;
    btn.disabled = false;
}

async function fetchAllReviews() { const { data } = await supabaseClient.from('reviews').select('*'); allReviews = data || []; }
async function fetchAllBookmarks() { if (currentUser) { const { data } = await supabaseClient.from('bookmarks').select('*').eq('user_id', currentUser.id); allBookmarks = data || []; } }
async function fetchAllEvents() { if (currentUser) { const { data } = await supabaseClient.from('events').select('*').eq('user_id', currentUser.id); allEvents = data || []; } }

// --- [PWA 가이드 로직] ---
window.hidePwaGuide = (days) => {
    if (days > 0) {
        const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
        localStorage.setItem('pwa_guide_expiry', expiry);
    }
    document.getElementById('pwaGuideModal').style.display = 'none';
};

function checkPwaGuide() {
    const expiry = localStorage.getItem('pwa_guide_expiry');
    if (expiry && Date.now() < parseInt(expiry)) return;
    
    // 로그인이 되어 있는 상태에서 홈 화면일 때만 노출 (선택사항)
    // 여기서는 단순히 모달을 띄우는 로직만 작성합니다.
    const modal = document.getElementById('pwaGuideModal');
    if (modal) modal.style.display = 'block';
}


init();
