// Global Variables
let map = null;
let markers = [];
let currentTileLayer;
let shanghaiData = null;
let allMarkers = []; // 모든 마커 정보를 저장할 배열 (라벨 가시성 포함)
let currentLocationMarker = null; // 현재 위치 마커
let labelUpdateTimeout = null; // 라벨 업데이트 디바운싱을 위한 타이머
let markerGroups = {
    attractions: L.featureGroup(),
    restaurants: L.featureGroup(),
    hotels: L.featureGroup(),
    airports: L.featureGroup()
};

// 마커 타입에 따른 배경색 정의 (라벨 테두리 색상에 사용)
const markerColors = {
    attractions: '#8B5A6B',  // 관광지 (레드와인 계열 어두운 버건디)
    restaurants: '#6B8E5A',  // 식당 (녹색 계열)
    airports: '#B87A8F',     // 공항 (레드와인과 상아색 중간톤)
    hotels: '#7B9EA8'        // 호텔 (따뜻한 파란색)
};

// 마커 타입별 우선순위 정의
const typePriorities = {
    'attractions': 4,  // 관광지
    'restaurants': 3,  // 식당
    'hotels': 2,       // 호텔
    'airports': 1      // 공항
};

// 지도 타일 레이어 정의
const tileLayers = {
    cartodb: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors & © CARTO'
    }),
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri'
    }),
    subway_transport: L.tileLayer('https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors & © Thunderforest'
    })
};

let currentTileLayerType = 'cartodb';

// 단일 클러스터 그룹 (카테고리 혼합 클러스터링 + 동일 크기 아이콘)
// 단일 레이어 그룹 (클러스터 대신 점 표시용)
let clusterGroups = {
    all: L.layerGroup()
};

// 지도 초기화 함수
async function initMap() {
    try {
        console.log('지도 초기화 시작');
        
        // 데이터 로드
        const response = await fetch('data/shanghai-data.json');
        if (!response.ok) {
            throw new Error('데이터 로드 실패');
        }
        const data = await response.json();
        if (!data.shanghai_tourism) {
            throw new Error('데이터 형식이 올바르지 않습니다.');
        }
        shanghaiData = data.shanghai_tourism;
        // 전역 일정 데이터 세팅 (모바일 타임라인 용)
        window.itineraryData = shanghaiData.itinerary;
        console.log('데이터 로드 완료:', shanghaiData);
        
        // 지도 생성 (초기 줌 레벨 9, 캔버스 우선 렌더러로 성능 개선)
        map = L.map('map', { preferCanvas: true }).setView([31.2304, 121.4737], 9);
        
        // 기본 타일 레이어 설정
        currentTileLayer = tileLayers.cartodb;
        currentTileLayer.addTo(map);
        currentTileLayerType = 'cartodb';

        // 줌 변경 이벤트 리스너
        map.on('zoomend', () => {
            updateLabelVisibility();
        });

        // 지도 이동 이벤트 리스너
        map.on('moveend', () => {
            updateLabelVisibility();
        });

        // 마커 그룹 초기화
        markerGroups = {
            attractions: L.featureGroup(),
            restaurants: L.featureGroup(),
            hotels: L.featureGroup(),
            airports: L.featureGroup()
        };

        // 마커 레이어 그룹을 지도에 추가 (클러스터 사용 안 함)
        const mixedCluster = clusterGroups.all;
        mixedCluster.addTo(map);

        displayMarkers();

        // 팝업 닫힐 때 라벨/표시 갱신 (초기화 이후에 바인딩)
        map.on('popupclose', function() {
            // 현재 구현에서는 별도 라벨 토글 없음. 필요시 표시 갱신 호출
            updateLabelVisibility();
        });
        
        // 이벤트 리스너 연결
        setupEventListeners();
        // 일정 패널 초기화
        initializeItineraryPanel();
        // 지도 클릭 시 동작 바인딩
        setupMapClickToClosePopup();
        // 모바일 하단 가로 타임라인 초기화
        initMobileTimeline();
    } catch (error) {
        console.error('데이터 로드 중 오류:', error);
    }
}

// 마커 표시 함수
function displayMarkers() {
    if (!map || !shanghaiData) {
        console.error('지도 또는 데이터가 초기화되지 않았습니다.');
        return;
    }
    allMarkers = [];
    Object.values(clusterGroups).forEach(group => group.clearLayers());

    const typeColors = {
        attractions: '#8B5A6B',
        restaurants: '#6B8E5A',
        hotels: '#7B9EA8',
        airports: '#B87A8F'
    };

    ['attractions', 'restaurants', 'hotels', 'airports'].forEach(type => {
        (shanghaiData[type] || []).forEach(place => {
            // place 객체에 type 정보 추가
            place.type = type;

            // 1) 일반 마커 (아이콘 + 라벨)
            const normalMarker = L.marker([place.latitude, place.longitude], {
                icon: createCustomIcon(type),
                name: place.name,
                type: type,
                place: place
            });
            normalMarker.bindPopup(createPopupContent(place));
            normalMarker.on('add', function() {
                const markerElem = normalMarker._icon;
                if (markerElem) {
                    let labelText = extractKorean(place.name);
                    if (labelText && labelText.includes(',')) {
                        labelText = labelText.split(',')[0].trim();
                    }
                    if (!labelText || labelText.trim() === '') {
                        labelText = place.name.split('/')[0].trim();
                    }
                    let label = markerElem.querySelector('.marker-label');
                    if (!label) {
                        label = document.createElement('div');
                        label.className = 'marker-label';
                        markerElem.appendChild(label);
                    }
                    label.setAttribute('data-color', typeColors[type]);
                    label.innerText = labelText;
                    markerElem.style.filter = 'none';
                    markerElem.style.boxShadow = 'none';
                    markerElem.style.outline = 'none';
                }
            });

            // 2) 작은 점 마커 (혼잡 시 사용)
            const dotMarker = L.circleMarker([place.latitude, place.longitude], {
                radius: 3,
                stroke: false,
                fill: true,
                fillColor: typeColors[type] || '#666',
                fillOpacity: 1.0
            });
            dotMarker.bindPopup(createPopupContent(place));

            // 초기에는 일반 마커 추가 (필터 후 혼잡도에 따라 dot로 전환)
            clusterGroups.all.addLayer(normalMarker);
            allMarkers.push({ marker: normalMarker, dot: dotMarker, place: { ...place, type } });
        });
    });
    Object.values(clusterGroups).forEach(group => map.addLayer(group));
    // 현재 가시 범위/줌 기준으로 혼잡도에 따라 점/마커 전환
    updateLabelVisibility();
}

// 영문명 추출 함수 (구글지도용)
function extractEnglishName(text) {
    // 괄호 안에서 영문명 찾기 (예: "The Bund", "Oriental Pearl TV Tower")
    const englishInParentheses = text.match(/\(([^,]*,\s*)?([A-Za-z\s\-'\.&]+)\)/);
    if (englishInParentheses && englishInParentheses[2] && englishInParentheses[2].trim() !== '') {
        return englishInParentheses[2].trim();
    }

    // 괄호가 없거나 영문명이 없으면 전체 텍스트에서 영문 부분 추출
    const englishParts = text.match(/[A-Za-z\s\-'\.&]+/g);
    if (englishParts && englishParts.length > 0) {
        const filteredParts = englishParts.filter(part => part.trim() !== '' && part.trim().length > 2);
        if (filteredParts.length > 0) {
            return filteredParts[filteredParts.length - 1].trim(); // 마지막 영문 부분 (보통 정식 영문명)
        }
    }

    // 영문명이 없으면 원본 텍스트 반환
    return text;
}

// 중국어명 추출 함수 (가오더지도용)
function extractChineseName(text) {
    // 첫 번째 공백이나 괄호 전까지의 중국어 부분 추출
    const chineseMatch = text.match(/^([^\s\(（]+)/);
    if (chineseMatch && chineseMatch[1]) {
        return chineseMatch[1].trim();
    }

    // 위 방법이 실패하면 중국어 문자 부분만 추출
    const chineseParts = text.match(/[\u4e00-\u9fff]+/g);
    if (chineseParts && chineseParts.length > 0) {
        return chineseParts[0]; // 첫 번째 중국어 부분
    }

    // 중국어가 없으면 원본 텍스트 반환
    return text;
}

// 한국어 이름 추출 함수
function extractKorean(text) {
    // 괄호 안에 한글이 있으면 그 부분 사용, 없으면 괄호 밖(원문)에서 한글 추출
    const match = text.match(/\(([^)]+)\)/);
    let source;
    if (match) {
        const inside = match[1];
        if (/[\u3131-\u318E\uAC00-\uD7A3]/.test(inside)) {
            source = inside;
        } else {
            // 괄호 부분 제거 후 바깥 텍스트 사용
            source = text.replace(/\s*\([^)]*\)\s*/, '').trim();
        }
    } else {
        source = text;
    }
    const parts = source.split(/[，,]/).map(s => s.trim()).filter(Boolean);
    const hangulPart = parts.find(p => /[\u3131-\u318E\uAC00-\uD7A3]/.test(p));
    return (hangulPart || parts[0] || text).trim();
}

// 일정표 전용 표시 이름 변환 (호텔은 '숙소'로 표기)
function displayLocationForSchedule(text) {
    const korean = extractKorean(text || '');
    const raw = text || '';
    const isHotel = /SSAW|부티크\s*호텔|上海中星铂尔曼酒店/i.test(raw) || /SSAW|부티크\s*호텔|上海中星铂尔曼酒店/i.test(korean);
    return isHotel ? '숙소' : korean;
}

// 식당 매칭: 일정의 location을 기반으로 레스토랑 데이터에서 메뉴를 찾는다
function findRestaurantMenuByLocation(locationText) {
    try {
        if (!window.shanghaiData || !window.shanghaiData.restaurants) return null;
        const loc = (locationText || '').toString();
        if (!loc) return null;
        const norm = (s) => (s || '').toString().replace(/\s+/g, '').toLowerCase();
        const locKor = norm(displayLocationForSchedule(loc));
        const locRaw = norm(loc);

        for (const r of window.shanghaiData.restaurants) {
            const name = r.name || '';
            const rKor = norm(extractKorean(name));
            const paren = (name.match(/\(([^)]+)\)/)?.[1] || '');
            const aliases = paren.split(/[，,]/).map(s => norm(s));
            const nameRaw = norm(name);

            const matched = (
                (rKor && (locKor.includes(rKor) || rKor.includes(locKor))) ||
                (nameRaw && (locRaw.includes(nameRaw) || nameRaw.includes(locRaw))) ||
                aliases.some(a => a && (locKor.includes(a) || a.includes(locKor)))
            );
            if (matched) {
                return Array.isArray(r.menu) ? r.menu : null;
            }
        }
        return null;
    } catch (e) {
        console.warn('findRestaurantMenuByLocation error', e);
        return null;
    }
}

function getMenuBadgeInfo(locationText) {
    const korName = extractKorean(locationText || '');
    const n = (korName || '').replace(/\s+/g, '');
    const is = (s) => n.includes(s);
    // 우선 순위: 명시적 매핑
    if (is('사계민복')) return { text: '북경오리', cls: 'wine' };
    if (is('하이디라오')) return { text: '훠궈', cls: 'wine' };
    if (is('핑지에훠궈') || is('핑지에')) return { text: '훠궈', cls: 'wine' };
    if (is('샤오양셩지엔') || is('샤오양셔지엔')) return { text: '딤섬', cls: 'wine' };
    if (is('점도덕')) return { text: '딤섬', cls: 'wine' };
    if (is('옛날옛적에') || is('양꼬치')) return { text: '양꼬치', cls: 'wine' };
    // 그 외에는 레스토랑 데이터의 메뉴 첫 항목 사용 (외곽선 스타일)
    const menu = findRestaurantMenuByLocation(locationText);
    if (menu && menu.length > 0) {
        const first = (menu[0] || '').toString().trim();
        if (first) return { text: first, cls: '' };
    }
    return { text: '', cls: '' };
}

// 설명을 3단어로 압축하는 함수
function compressDescription(description) {
    const words = description.split(' ');
    if (words.length <= 3) return description;
    return words.slice(0, 3).join(' ') + '...';
}

// 커스텀 아이콘 생성 함수
function createCustomIcon(type) {
    const iconMap = {
        attractions: 'fa-landmark',
        restaurants: 'fa-utensils',
        airports: 'fa-plane',
        hotels: 'fa-hotel'
    };
    
    return L.divIcon({
        className: 'custom-marker-icon',
        html: `<div class="circle-marker ${type}-bg"><i class="fas ${iconMap[type]}"></i></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -9]
    });
}

// 장소 타입을 한글로 변환하는 함수
function getTypeLabel(type) {
    const typeLabels = {
        'attractions': '관광지',
        'restaurants': '맛집',
        'hotels': '숙소',
        'airports': '공항'
    };
    return typeLabels[type] || type;
}

// 팝업 내용 생성 함수 (마커 팝업)
function createPopupContent(place) {
    let koreanName = extractKorean(place.name);
    if (koreanName.includes(',')) koreanName = koreanName.split(',')[0].trim();
    const englishName = extractEnglishName(place.name);
    const typeLabel = getTypeLabel(place.type || 'attractions');
    const typeColors = {
        attractions: { border: '#8B5A6B', background: '#FFF8F0', text: '#8B5A6B' },
        restaurants: { border: '#6B8E5A', background: '#FFF8F0', text: '#6B8E5A' },
        hotels: { border: '#7B9EA8', background: '#FFF8F0', text: '#7B9EA8' },
        airports: { border: '#B87A8F', background: '#FFF8F0', text: '#B87A8F' }
    };
    const colors = typeColors[place.type || 'attractions'];
    let html = `<div class='custom-popup' style="border-color: ${colors.border}; background: ${colors.background}; color: ${colors.text};">`;
    html += `<div class='popup-header center' style="display:flex;flex-direction:column;align-items:center;gap:0;background: #FFF8F0; color: ${colors.text}; border-bottom: 1.5px solid ${colors.border};">
        <div class='popup-title-main' style="font-size:1.18em;font-weight:800;color:${colors.text};margin-bottom:2px;text-align:center;">${koreanName}</div>
        <div class='popup-title-english' style="font-size:0.92em;color:${colors.text};margin-bottom:6px;text-align:center;font-weight:400;letter-spacing:0.01em;opacity:0.9;">${englishName}</div>
        <div class='popup-type-label' style="display:inline-block;margin:0 auto 8px auto;padding:3px 16px;border-radius:14px;background: ${colors.border};color:#FFF8F0;font-family:'Yangjin','Noto Sans KR',sans-serif;font-size:0.95em;font-weight:700;border:1.5px solid ${colors.border};box-shadow:0 1px 4px rgba(0,0,0,0.1);">${typeLabel}</div>
    </div>`;
    html += `<div class='popup-body' style="background: ${colors.background}; color: ${colors.text};">`;
    html += `<div class='popup-info'>`;
    if (place.address && place.address !== "N/A") {
        html += `<div class='popup-info-row' style="color: ${colors.text};"><i class='fas fa-map-marker-alt' style="color: ${colors.text} !important;"></i><span style='color:${colors.text};'>${place.address}</span></div>`;
    }
    if (place.description) {
        html += `<div class='popup-info-row' style="color: ${colors.text};"><i class='fas fa-info-circle' style="color: ${colors.text} !important;"></i><span style='color:${colors.text};'>${place.description}</span></div>`;
    }
    if (place.features && place.features.length > 0) {
        html += `<div class='popup-info-row' style="color: ${colors.text};"><i class='fas fa-star' style="color: ${colors.text} !important;"></i><span style='color:${colors.text};'>${place.features.join(', ')}</span></div>`;
    }
    if (place.price && place.type !== 'hotels') {
        const priceYuan = parseInt(place.price);
        const priceWon = Math.round(priceYuan * 195);
        html += `<div class='popup-info-row price' style="color: ${colors.text};"><i class='fas fa-coins' style="color: ${colors.text} !important;"></i><span style='color:${colors.text};'>¥${priceYuan.toLocaleString()} (₩${priceWon.toLocaleString()})</span></div>`;
    }
    html += `</div>`;
    html += `<div class='map-buttons row'>
        <a class='map-btn google-btn' style='min-width:135px;text-align:center;background: ${colors.background}; border-color: ${colors.border}; color: ${colors.text};' href='javascript:void(0)' onclick='openGoogleMaps("${place.name}", ${place.latitude}, ${place.longitude})'>
            <i class='fab fa-google'></i>구글지도
        </a>
        <a class='map-btn amap-btn' style='min-width:135px;text-align:center;background: ${colors.background}; border-color: ${colors.border}; color: ${colors.text};' href='javascript:void(0)' onclick='openAmapSearch("${place.name}", ${place.latitude}, ${place.longitude})'>
            <i class='fas fa-map-marked-alt'></i>가오더지도
        </a>
    </div>`;
    html += `</div>`;
    html += `</div>`;
    return html;
}

// 이벤트 리스너 설정 함수
function setupEventListeners() {
    // ESC 키로 열려있는 Leaflet 팝업 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            map.closePopup();
        }
    });

    // 위치 찾기 버튼
    const locateBtn = document.getElementById('locate-btn');
    if (locateBtn) {
        locateBtn.addEventListener('click', findMyLocation);
    }

    // 지도 타입 선택 이벤트 리스너
    const tileButtons = document.querySelectorAll('.tile-btn');
    tileButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tileType = this.getAttribute('data-tile');
            changeTileLayer(tileType);
            
            // 활성 상태 업데이트
            tileButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // 일정표 버튼 클릭 시 타임라인 팝업 오픈 (상단 배지)
    const itineraryBadgeBtn = document.getElementById('itinerary-badge-btn');
    if (itineraryBadgeBtn) {
        itineraryBadgeBtn.addEventListener('click', function() {
            displayItineraryTimeline('day1');
        });
    }

    // 날짜 버튼 이벤트 리스너
    document.querySelectorAll('.day-btn').forEach(button => {
        button.addEventListener('click', function() {
            const dayKey = this.getAttribute('data-day');
            
            if (dayKey === 'all') {
                // 전체 일정 팝업 표시
                const itineraryPopup = document.getElementById('itinerary-popup');
                itineraryPopup.classList.add('show');
                displayItinerary('all');
                filterMarkersByDay('all'); // 모든 마커 표시
            } else {
                showDayBottomSheet(dayKey);
                filterMarkersByDay(dayKey);
            }
        });
    });
}

// 마커 그룹 토글 함수 (범례 체크박스와 연동)
function toggleMarkerGroup(type, show) {
    if (show) {
        showMarkerGroup(type);
    } else {
        hideMarkerGroup(type);
    }
}

// 마커 그룹 표시/숨김 함수
function showMarkerGroup(type) {
    if (clusterGroups[type]) {
        map.addLayer(clusterGroups[type]);
    }
}

function hideMarkerGroup(type) {
    if (clusterGroups[type]) {
        map.removeLayer(clusterGroups[type]);
    }
}

// 내 위치 찾기 함수
function findMyLocation() {
    const locateBtn = document.getElementById('locate-btn');
    const icon = locateBtn.querySelector('i');

    // 로딩 상태로 변경
    icon.className = 'fas fa-spinner fa-spin';
    locateBtn.disabled = true;

    if (!navigator.geolocation) {
        alert('이 브라우저에서는 위치 서비스가 지원되지 않습니다.');
        resetLocateButton();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            map.setView([lat, lng], 15);

            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
            }

            currentLocationMarker = L.marker([lat, lng], {
                icon: createCurrentLocationIcon()
            }).addTo(map);

            currentLocationMarker.bindTooltip('현재 위치', {
                permanent: false,
                direction: 'bottom',
                offset: [0, 12],
                className: 'current-location-label'
            }).openTooltip();

            resetLocateButton();
        },
        function(error) {
            let errorMessage = '위치를 찾을 수 없습니다.';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = '위치 접근이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = '위치 정보를 사용할 수 없습니다. GPS 또는 네트워크를 확인해주세요.';
                    break;
                case error.TIMEOUT:
                    errorMessage = '위치 요청 시간이 초과되었습니다. 다시 시도해주세요.';
                    break;
                default:
                    errorMessage = `알 수 없는 오류 발생: ${error.message}`;
            }
            alert(errorMessage);
            resetLocateButton();
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}

// 위치 찾기 버튼 상태 리셋 함수
function resetLocateButton() {
    const locateBtn = document.getElementById('locate-btn');
    const icon = locateBtn.querySelector('i');
    
    icon.className = 'fas fa-location-crosshairs';
    locateBtn.disabled = false;
}

// 현재 위치 마커 아이콘 생성 함수
function createCurrentLocationIcon() {
    return L.divIcon({
        className: 'current-location-marker',
        html: `<div class="location-pulse">
                     <div class="location-dot"></div>
                   </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        tooltipAnchor: [0, 18] // 현재 위치 툴팁도 정확한 위치에 표시
    });
}

// 라벨 가시성 업데이트 함수
function updateLabelVisibility() {
    // 혼잡도 기반으로 점/마커 전환
    updateDenseDots();
}

// 현재 지도 뷰의 가시 레이어(필터 결과)에 대해 픽셀 거리 기반 밀집 판정 후 점/마커 전환
function updateDenseDots() {
    if (!map) return;
    const threshold = 24; // px 단위 임계치: 이보다 가까우면 점으로 표시
    const cell = threshold;

    // 현재 보이는 엔트리 수집 (일단 normal/dot 중 하나가 지도에 올라온 항목)
    const visibleEntries = [];
    allMarkers.forEach(entry => {
        const hasNormal = clusterGroups.all.hasLayer(entry.marker) && map.hasLayer(clusterGroups.all);
        const hasDot = clusterGroups.all.hasLayer(entry.dot) && map.hasLayer(clusterGroups.all);
        if (hasNormal || hasDot) visibleEntries.push(entry);
    });

    // 좌표 그리드 버킷 구성
    const buckets = new Map();
    function keyFor(pt) {
        return `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`;
    }
    const points = visibleEntries.map((entry, idx) => {
        const latlng = entry.marker.getLatLng();
        const pt = map.latLngToLayerPoint(latlng);
        return { idx, pt };
    });
    points.forEach(p => {
        const k = keyFor(p.pt);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(p);
    });

    // 밀집 여부 판정
    const denseFlags = new Array(visibleEntries.length).fill(false);
    const neighborOffsets = [-1, 0, 1];
    points.forEach(p => {
        const gx = Math.floor(p.pt.x / cell);
        const gy = Math.floor(p.pt.y / cell);
        for (let dx of neighborOffsets) {
            for (let dy of neighborOffsets) {
                const nk = `${gx + dx}:${gy + dy}`;
                const arr = buckets.get(nk);
                if (!arr) continue;
                for (let q of arr) {
                    if (q.idx === p.idx) continue;
                    const dxp = q.pt.x - p.pt.x;
                    const dyp = q.pt.y - p.pt.y;
                    if ((dxp * dxp + dyp * dyp) <= (threshold * threshold)) {
                        denseFlags[p.idx] = true;
                        // 한 번 dense로 판정되면 더 볼 필요 없음
                        break;
                    }
                }
                if (denseFlags[p.idx]) break;
            }
            if (denseFlags[p.idx]) break;
        }
    });

    // 토글: 밀집이면 dot, 아니면 normal
    denseFlags.forEach((isDense, i) => {
        const entry = visibleEntries[i];
        const hasNormal = clusterGroups.all.hasLayer(entry.marker);
        const hasDot = clusterGroups.all.hasLayer(entry.dot);
        if (isDense) {
            if (hasNormal) clusterGroups.all.removeLayer(entry.marker);
            if (!hasDot) clusterGroups.all.addLayer(entry.dot);
        } else {
            if (hasDot) clusterGroups.all.removeLayer(entry.dot);
            if (!hasNormal) clusterGroups.all.addLayer(entry.marker);
        }
    });
}

// 그룹 상세 정보 팝업 표시 함수
function displayGroupDetails(group) {
    const popup = L.popup({
        maxWidth: 300,
        closeButton: true,
        autoClose: true,
        closeOnEscapeKey: true,
        className: 'custom-popup'
    });

    const place = group.places[0];
    let content = `<div class="popup-header type-${place.type}">`;
    content += `<h3>${extractKorean(place.name)}</h3>`;
    content += '</div>';
    
    content += '<div class="popup-content">';

    // 주소 정보
    if (place.address && place.address !== "N/A") {
        content += `<p><strong>주소:</strong> ${place.address}</p>`;
    }

    // 설명
    if (place.description) {
        content += `<p><strong>설명:</strong> ${place.description}</p>`;
    }

    // 특징
    if (place.features && place.features.length > 0) {
        content += '<div class="features-tags">';
        place.features.forEach(feature => {
            content += `<span class="feature-tag">${feature}</span>`;
        });
        content += '</div>';
    }

    // 메뉴 (식당인 경우)
    if (place.type === 'restaurants' && place.menu && place.menu.length > 0) {
        content += '<p><strong>대표 메뉴:</strong></p>';
        content += '<ul class="menu-list">';
        place.menu.forEach(item => {
            content += `<li>${item}</li>`;
        });
        content += '</ul>';
    }

    // 외부 지도 링크
    content += '<div class="map-links">';
    content += '<h4>외부 지도에서 보기</h4>';
    content += '<div class="map-buttons">';
    
    // 구글 지도 (영어명으로 검색)
    const englishName = place.name.split('(')[0].trim();
    content += `<button class="map-btn google-btn" onclick="openGoogleMaps('${englishName}', ${place.latitude}, ${place.longitude})">
        <i class="fab fa-google"></i> 구글지도
    </button>`;
    
    // 가오더 지도 (중국어명으로 검색)
    const chineseName = place.name.split('(')[1]?.split(')')[0]?.trim() || englishName;
    content += `<button class="map-btn amap-btn" onclick="openAmapSearch('${chineseName}', ${place.latitude}, ${place.longitude})">
        <i class="fas fa-map"></i> 가오더지도
    </button>`;
    
    content += '</div></div>';
    content += '</div>';

    popup.setContent(content);
    popup.setLatLng([group.latitude, group.longitude]);
    popup.openOn(map);
}

// 새 일정 타임라인 팝업 렌더러
function displayItineraryTimeline(dayKey) {
    const itineraryPopup = document.getElementById('itinerary-popup');
    const itineraryContent = document.getElementById('itinerary-content');
    if (!itineraryPopup || !itineraryContent) return;

    // 헤더 탭 구성
    const header = itineraryPopup.querySelector('.itinerary-popup-header');
    if (header) {
        header.innerHTML = `
          <div class='day-tabs'>
            <button class='day-tab ${dayKey==='day1'?'active':''}' data-day='day1'>1일차</button>
            <button class='day-tab ${dayKey==='day2'?'active':''}' data-day='day2'>2일차</button>
            <button class='day-tab ${dayKey==='day3'?'active':''}' data-day='day3'>3일차</button>
            <button class='day-tab ${dayKey==='day4'?'active':''}' data-day='day4'>4일차</button>
            <button class='day-tab ${dayKey==='all'?'active':''}' data-day='all'>전체</button>
          </div>
          <button id="close-itinerary" class="close-button" style="position:absolute;top:12px;right:16px;background:rgba(139,30,63,0.08);border:none;border-radius:50%;color:#8B1E3F;font-size:1.2em;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color 0.2s,transform 0.2s;z-index:10;"><i class='fas fa-times'></i></button>`;
        header.querySelectorAll('.day-tab').forEach(btn => btn.addEventListener('click', () => displayItineraryTimeline(btn.dataset.day)));
        document.getElementById('close-itinerary').onclick = () => itineraryPopup.classList.remove('show');
    }

    itineraryContent.innerHTML = buildTimelineHTML(dayKey);
    itineraryPopup.classList.add('show');
}

function buildTimelineHTML(dayKey) {
    const buildTable = (daySchedule) => {
        const entries = Object.entries(daySchedule).sort((a,b)=> (a[1].time||'00:00').localeCompare(b[1].time||'00:00'));
        let html = `<div class='timeline-table'>`;
        for (let i=0;i<entries.length;i++) {
            const [key, schedule] = entries[i];
            const next = entries[i+1]?.[1];
            const locName = displayLocationForSchedule(schedule.location);
            const menuInfo = getMenuBadgeInfo(schedule.location);
            const transportCost = schedule.cost?.transport ? `교통 ¥${parseInt(schedule.cost.transport).toLocaleString()}` : '';
            const activityCost = schedule.cost?.activity ? `활동 ¥${parseInt(schedule.cost.activity).toLocaleString()}` : '';
            const mealCost = schedule.cost?.meal ? `식사 ¥${parseInt(schedule.cost.meal).toLocaleString()}` : '';
            // 점(일정)에서는 교통비 제외: 이동 구간에서만 표기
            const costLabel = [mealCost, activityCost].filter(Boolean).join(' · ');
            html += `
              <div class='timeline-row'>
                <div class='timeline-col-line'>
                  <div class='timeline-dot'></div>
                </div>
                <div class='timeline-col-content'>
                  <div class='timeline-content'>
                    <div class='timeline-top'>
                      <div class='timeline-time'>${schedule.time || ''}</div>
                      <div class='timeline-place'>${locName}</div>
                      ${menuInfo.text ? `<div class='timeline-menu-badge'><span class='menu-badge ${menuInfo.cls}'>${menuInfo.text}</span></div>` : ''}
                      ${costLabel ? `<div class='timeline-cost'>${costLabel}</div>` : ''}
                    </div>
                    ${schedule.description ? `<div class='timeline-desc'>${schedule.description}</div>` : ''}
                  </div>
                </div>
              </div>`;
            if (next) {
              // 구간(A→B)은 '다음 일정(B)'에 기록된 거리/교통비를 사용해 A와 B 사이에 표시
              const dist = (next.distance && next.distance !== null) ? next.distance : '-';
              const moveCost = next.cost?.transport ? `교통 ¥${parseInt(next.cost.transport).toLocaleString()}` : '';
              html += `
                <div class='timeline-segment-row'>
                  <div class='timeline-col-line'></div>
                  <div class='timeline-col-content'>
                    <div class='timeline-segment'>이동: ${dist}${moveCost ? ` · ${moveCost}`: ''}</div>
                  </div>
                </div>`;
            }
        }
        html += `</div>`;
        return html;
    };
    if (dayKey === 'all') {
        let out = '';
        for (let i=1;i<=4;i++) {
            const dk = `day${i}`;
            const ds = shanghaiData.itinerary[dk];
            if (!ds) continue;
            out += `<div style='padding:6px 12px;font-weight:700;color:#8B1E3F;'>${i}일차</div>`;
            out += buildTable(ds);
        }
        return out || `<div style='padding:12px;'>전체 일정이 없습니다.</div>`;
    } else {
        const ds = shanghaiData.itinerary[dayKey];
        if (!ds) return '<div style="padding:14px;">해당 일자의 일정이 없습니다.</div>';
        return buildTable(ds);
    }
}

// 외부 지도 열기 함수
function openGoogleMaps(name, lat, lng) {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${lat},${lng}`;
    window.open(url, '_blank');
}

function openAmapSearch(name, lat, lng) {
    const url = `https://uri.amap.com/search?keyword=${encodeURIComponent(name)}&location=${lng},${lat}`;
    window.open(url, '_blank');
}

// 지도 타일 변경 함수
function changeTileLayer(type) {
    if (map && tileLayers[type]) {
        if (currentTileLayer) {
            map.removeLayer(currentTileLayer);
        }
        currentTileLayer = tileLayers[type];
        currentTileLayer.addTo(map);
        currentTileLayerType = type;
        updateTileOptionStyles(type);
        console.log(`지도 타일 레이어 변경: ${type}`);
    }
}

// 모든 관광지 마커 숨기기
function hideAllTourismMarkers() {
    Object.values(clusterGroups).forEach(group => {
        if (map.hasLayer(group)) {
            map.removeLayer(group);
        }
    });
}

// 모든 관광지 마커 보이기
function showAllTourismMarkers() {
    Object.values(clusterGroups).forEach(group => {
        if (!map.hasLayer(group)) {
            group.addTo(map);
        }
    });
}

// 타일 옵션 스타일 업데이트 함수
function updateTileOptionStyles(activeType) {
    const tileOptions = document.querySelectorAll('.tile-option');
    tileOptions.forEach(option => {
        const input = option.querySelector('input[type="radio"]');
        if (input.value === activeType) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}

// 일정 패널 기능
function initializeItineraryPanel() {
    const itineraryPopup = document.getElementById('itinerary-popup');
    const closeButton = document.getElementById('close-itinerary');

    if (!itineraryPopup || !closeButton) return;
    
    // 닫기 버튼 클릭 이벤트
    closeButton.addEventListener('click', () => {
        itineraryPopup.classList.remove('show');
        filterMarkersByDay('all'); // 모든 마커 다시 표시
    });
    
    // 팝업 외부 클릭 시 닫기
    itineraryPopup.addEventListener('click', (e) => {
        if (e.target === itineraryPopup) {
            itineraryPopup.classList.remove('show');
            filterMarkersByDay('all'); // 모든 마커 다시 표시
        }
    });
}

function calculateDayCosts(daySchedule) {
    let transportCost = 0;
    let mealCost = 0;
    let activityCost = 0;
    
    Object.values(daySchedule).forEach(schedule => {
        if (schedule.cost) {
            if (schedule.cost.transport) {
                const cost = parseInt(schedule.cost.transport.replace(/[^\d]/g, '')) || 0;
                transportCost += cost;
            }
            if (schedule.cost.activity) {
                const cost = parseInt(schedule.cost.activity.replace(/[^\d]/g, '')) || 0;
                // 식사 관련 키워드가 있으면 식사비용으로 분류
                if (schedule.cost.activity.includes('식사') || schedule.cost.activity.includes('meal')) {
                    mealCost += cost;
                } else {
                    activityCost += cost;
                }
            }
        }
        
        // 식사 관련 일정에서 식사 비용 추출
        if (['breakfast', 'lunch', 'dinner'].includes(schedule.type || schedule.key)) {
            // 식사 비용이 별도로 있으면 사용, 없으면 기본값
            const mealPrice = schedule.mealCost || schedule.cost?.meal || 50; // 기본 50위안
            mealCost += parseInt(mealPrice) || 0;
        }
    });
    
    return {
        transport: transportCost,
        meal: mealCost,
        activity: activityCost,
        total: transportCost + mealCost + activityCost
    };
}

function displayItinerary(dayKey) {
    const itineraryPopup = document.getElementById('itinerary-popup');
    const itineraryContent = document.getElementById('itinerary-content');
    // 일정 팝업 헤더에 텍스트 동적 추가
    const itineraryHeader = itineraryPopup.querySelector('.itinerary-popup-header');
    if (itineraryHeader) {
        let titleText = '';
        if (dayKey === 'all') titleText = '전체 일정';
        else if (dayKey === 'day1') titleText = '1일차 일정';
        else if (dayKey === 'day2') titleText = '2일차 일정';
        else if (dayKey === 'day3') titleText = '3일차 일정';
        else if (dayKey === 'day4') titleText = '4일차 일정';
        itineraryHeader.innerHTML = `<div style='width:100%;text-align:center;font-size:1.15em;font-weight:700;color:#8B1E3F;letter-spacing:-0.01em;'>${titleText}</div><button id="close-itinerary" class="close-button" style="position:absolute;top:12px;right:16px;background:rgba(139,30,63,0.08);border:none;border-radius:50%;color:#8B1E3F;font-size:1.2em;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color 0.2s,transform 0.2s;z-index:10;"><i class="fas fa-times"></i></button>`;
        // 닫기 버튼 이벤트 재연결
        document.getElementById('close-itinerary').onclick = () => itineraryPopup.classList.remove('show');
    }
    if (dayKey === 'all') {
        // 전체 일정 출력
        let allItineraryHTML = '<div class="all-itinerary">';
        let totalTransportCost = 0;
        let totalMealCost = 0;
        let totalActivityCost = 0;
        for (let i = 1; i <= 4; i++) {
            const dayKey = `day${i}`;
            const daySchedule = shanghaiData.itinerary[dayKey];
            if (!daySchedule) continue;
            const dayTitle = i === 1 ? '11.12 (1일차)' :
                            i === 2 ? '11.13 (2일차)' :
                            i === 3 ? '11.14 (3일차)' : '11.15 (4일차)';
            const dayCosts = calculateDayCosts(daySchedule);
            totalTransportCost += dayCosts.transport;
            totalMealCost += dayCosts.meal;
            totalActivityCost += dayCosts.activity;
            
            allItineraryHTML += `<div class="day-schedule all-day-schedule wine-theme" style="background:#FFF8F0;border:2px solid #8B1E3F;border-radius:16px;margin-bottom:18px;padding:10px 0;">
                <h4 class="wine" style="margin:0 0 8px 0;padding:0 18px;font-size:1.1em;text-align:center;"><i class="fas fa-calendar-day wine"></i> ${dayTitle}</h4>
                <div class="day-cost-summary wine-theme" style="padding:0 18px;">
                    <div class="cost-breakdown" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
                        <div class="cost-item" style="flex:1;text-align:center;"><span>🚇 교통</span><br><span>¥${dayCosts.transport.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${(dayCosts.transport * 195).toLocaleString()})</span></div>
                        <div class="cost-item" style="flex:1;text-align:center;"><span>🍽️ 식사</span><br><span>¥${dayCosts.meal.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${(dayCosts.meal * 195).toLocaleString()})</span></div>
                        <div class="cost-item" style="flex:1;text-align:center;"><span>🎯 관광</span><br><span>¥${dayCosts.activity.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${(dayCosts.activity * 195).toLocaleString()})</span></div>
                    </div>
                    <div class="cost-total" style="text-align:center;font-weight:700;font-size:1.08em;">총합: ¥${dayCosts.total.toLocaleString()} (₩${(dayCosts.total * 195).toLocaleString()})</div>
                </div>
                <div class="schedule-grid" style="padding:0 18px;">`;
            const scheduleItems = Object.entries(daySchedule).sort((a, b) => {
                const timeA = a[1].time || '00:00';
                const timeB = b[1].time || '00:00';
                return timeA.localeCompare(timeB);
            });
            scheduleItems.forEach(([key, schedule], idx) => {
                const icon = getScheduleIcon(key);
                const itemClass = getScheduleItemClass(key);
                const locationName = displayLocationForSchedule(schedule.location);
                const distance = schedule.distance || '-';
                // 교통비
                const transportCost = schedule.cost?.transport ? `<span class='cost-label'>교통</span> ¥${parseInt(schedule.cost.transport).toLocaleString()}` : '';
                // activity에 식사 관련 키워드가 있으면 식사로, 아니면 관광으로
                let mealCost = '';
                let activityCost = '';
                if (schedule.cost?.activity) {
                    const activityStr = schedule.cost.activity;
                    if (activityStr.includes('식사') || activityStr.toLowerCase().includes('meal')) {
                        mealCost = `<span class='cost-label'>식사</span> ¥${parseInt(activityStr).toLocaleString()}`;
                    } else {
                        activityCost = `<span class='cost-label'>관광</span> ¥${parseInt(activityStr).toLocaleString()}`;
                    }
                }
                // 별도 meal 필드가 있으면 식사비용으로
                if (schedule.cost?.meal) {
                    mealCost = `<span class='cost-label'>식사</span> ¥${parseInt(schedule.cost.meal).toLocaleString()}`;
                }
                allItineraryHTML += `<div class="schedule-item wine-theme ${itemClass}" style="display:grid;grid-template-columns:48px 1.2fr 0.8fr 1.1fr;gap:2px;align-items:center;background:#FFF8F0;border-radius:0;margin-bottom:0;padding:3px 6px;font-size:0.85em;color:#8B1E3F;font-family:'Yangjin','Noto Sans KR','Apple SD Gothic Neo',sans-serif;">
                    <div class="bottom-sheet-time"><i class="${icon}"></i><span>${schedule.time}</span></div>
                    <div class="bottom-sheet-location" style="color:#8B1E3F;font-size:1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${locationName}</div>
                    <div class="bottom-sheet-distance" style="color:#B2455E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${distance}</div>
                    <div class="bottom-sheet-cost wine" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;">
                        ${transportCost ? `<div class="transport-cost wine">${transportCost}</div>` : ''}
                        ${mealCost ? `<div class="meal-cost wine">${mealCost}</div>` : ''}
                        ${activityCost ? `<div class="activity-cost wine">${activityCost}</div>` : ''}
                    </div>
                </div>`;
                // 일정과 일정 사이에 레드와인 구분선 추가 (마지막 항목 제외)
                if (idx < scheduleItems.length - 1) {
                    allItineraryHTML += `<div style="height:2px;width:98%;margin:0 auto;background:linear-gradient(90deg,#8B1E3F 0%,#B2455E 100%);opacity:0.7;border-radius:2px;"></div>`;
                }
            });
            allItineraryHTML += `</div></div>`;
        }
        const totalCost = totalTransportCost + totalMealCost + totalActivityCost;
        // 숙소와 항공료 추가 (전체일정에서만 표시)
        const hotelCost = 1504879; // 한화
        const flightCost = 2191700; // 한화
        const hotelCostYuan = Math.round(hotelCost / 195); // 위안화로 변환
        const flightCostYuan = Math.round(flightCost / 195); // 위안화로 변환
        const totalCostWithAccommodation = totalCost + hotelCostYuan + flightCostYuan;
        
        allItineraryHTML = `<div style="position:relative;">
            <div style="position:absolute;top:-15px;right:0;font-size:0.65em;color:#B2455E;font-weight:500;z-index:1;">(1¥=₩195)</div>
            <div class="day-cost-summary total-cost-summary wine-theme" style="background:#FFF8F0;border:2px solid #8B1E3F;border-radius:16px;margin-bottom:18px;padding:10px 18px;">
                <div class="cost-breakdown" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
                    <div class="cost-item" style="flex:1;text-align:center;"><span>🚇 교통</span><br><span>¥${totalTransportCost.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${(totalTransportCost * 195).toLocaleString()})</span></div>
                    <div class="cost-item" style="flex:1;text-align:center;"><span>🍽️ 식사</span><br><span>¥${totalMealCost.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${(totalMealCost * 195).toLocaleString()})</span></div>
                    <div class="cost-item" style="flex:1;text-align:center;"><span>🎯 관광</span><br><span>¥${totalActivityCost.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${(totalActivityCost * 195).toLocaleString()})</span></div>
                    <div class="cost-item" style="flex:1;text-align:center;"><span>🏨 숙소</span><br><span>¥${hotelCostYuan.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${hotelCost.toLocaleString()})</span></div>
                    <div class="cost-item" style="flex:1;text-align:center;"><span>✈️ 항공</span><br><span>¥${flightCostYuan.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${flightCost.toLocaleString()})</span></div>
                </div>
                <div class="cost-total" style="text-align:center;font-weight:700;font-size:1.08em;">총합: ¥${totalCostWithAccommodation.toLocaleString()} (₩${(totalCostWithAccommodation * 195).toLocaleString()})</div>
            </div>
        </div>` + allItineraryHTML;
        itineraryContent.innerHTML = allItineraryHTML;
        itineraryPopup.classList.add('show');
        return;
    }
    // 이하 기존 일자별 일정 출력 로직(마커 팝업과 동일한 스타일)
    const daySchedule = shanghaiData.itinerary[dayKey];
    if (!daySchedule) return;
    const dayTitle = dayKey === 'day1' ? '11.12 (1일차)' : 
                    dayKey === 'day2' ? '11.13 (2일차)' : 
                    dayKey === 'day3' ? '11.14 (3일차)' : '11.15 (4일차)';
    // 비용 요약
    const dayCosts = calculateDayCosts(daySchedule);
    
    let html = `<div class="day-cost-summary wine-theme">
        <div class="cost-breakdown" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
            <div class="cost-item" style="flex:1;text-align:center;"><span>🚇 교통</span><br><span>¥${dayCosts.transport.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${(dayCosts.transport * 195).toLocaleString()})</span></div>
            <div class="cost-item" style="flex:1;text-align:center;"><span>🍽️ 식사</span><br><span>¥${dayCosts.meal.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${(dayCosts.meal * 195).toLocaleString()})</span></div>
            <div class="cost-item" style="flex:1;text-align:center;"><span>🎯 관광</span><br><span>¥${dayCosts.activity.toLocaleString()}</span><br><span style="font-size:0.7em;color:#B2455E;letter-spacing:-0.5px;">(₩${(dayCosts.activity * 195).toLocaleString()})</span></div>
        </div>
        <div class="cost-total" style="text-align:center;font-weight:700;font-size:1.08em;">총합: ¥${dayCosts.total.toLocaleString()} (₩${(dayCosts.total * 195).toLocaleString()})</div>
    </div>`;
    // 일정 항목들
    const scheduleItems = Object.entries(daySchedule).sort((a, b) => {
        const timeA = a[1].time || '00:00';
        const timeB = b[1].time || '00:00';
        return timeA.localeCompare(timeB);
    });
    scheduleItems.forEach(([key, schedule], idx) => {
        const icon = getScheduleIcon(key);
        const itemClass = getScheduleItemClass(key);
        const locationName = displayLocationForSchedule(schedule.location);
        const distance = schedule.distance || '-';
        // 교통비
        const transportCost = schedule.cost?.transport ? `<span class='cost-label'>교통</span> ¥${parseInt(schedule.cost.transport).toLocaleString()}` : '';
        // activity에 식사 관련 키워드가 있으면 식사로, 아니면 관광으로
        let mealCost = '';
        let activityCost = '';
        if (schedule.cost?.activity) {
            const activityStr = schedule.cost.activity;
            if (activityStr.includes('식사') || activityStr.toLowerCase().includes('meal')) {
                mealCost = `<span class='cost-label'>식사</span> ¥${parseInt(activityStr).toLocaleString()}`;
            } else {
                activityCost = `<span class='cost-label'>관광</span> ¥${parseInt(activityStr).toLocaleString()}`;
            }
        }
        // 별도 meal 필드가 있으면 식사비용으로
        if (schedule.cost?.meal) {
            mealCost = `<span class='cost-label'>식사</span> ¥${parseInt(schedule.cost.meal).toLocaleString()}`;
        }
        html += `<div class="schedule-item wine-theme ${itemClass}" style="display:grid;grid-template-columns:48px 1.2fr 0.8fr 1.1fr;gap:2px;align-items:center;background:#FFF8F0;border-radius:0;margin-bottom:0;padding:3px 6px;font-size:0.85em;color:#8B1E3F;font-family:'Yangjin','Noto Sans KR','Apple SD Gothic Neo',sans-serif;">
            <div class="bottom-sheet-time"><i class="${icon}"></i><span>${schedule.time}</span></div>
            <div class="bottom-sheet-location" style="color:#8B1E3F;font-size:1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${locationName}</div>
            <div class="bottom-sheet-distance" style="color:#B2455E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${distance}</div>
            <div class="bottom-sheet-cost wine" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;">
                ${transportCost ? `<div class="transport-cost wine">${transportCost}</div>` : ''}
                ${mealCost ? `<div class="meal-cost wine">${mealCost}</div>` : ''}
                ${activityCost ? `<div class="activity-cost wine">${activityCost}</div>` : ''}
            </div>
        </div>`;
        // 일정과 일정 사이에 레드와인 구분선 추가 (마지막 항목 제외)
        if (idx < scheduleItems.length - 1) {
            html += `<div style="height:2px;width:98%;margin:0 auto;background:linear-gradient(90deg,#8B1E3F 0%,#B2455E 100%);opacity:0.7;border-radius:2px;"></div>`;
        }
    });
    itineraryContent.innerHTML = html;
    itineraryPopup.classList.add('show');
    // 닫기 버튼 및 외부 클릭 이벤트는 기존과 동일하게 유지
}

function getScheduleIcon(key) {
    const iconMap = {
        'arrival': 'fas fa-plane-arrival',
        'departure': 'fas fa-plane-departure',
        'hotel': 'fas fa-bed',
        'hotel_return': 'fas fa-bed',
        'breakfast': 'fas fa-coffee',
        'lunch': 'fas fa-utensils',
        'dinner': 'fas fa-utensils',
        'morning': 'fas fa-sun',
        'afternoon': 'fas fa-sun',
        'afternoon1': 'fas fa-sun',
        'afternoon2': 'fas fa-sun',
        'afternoon3': 'fas fa-sun',
        'evening': 'fas fa-moon',
        'evening1': 'fas fa-moon',
        'evening2': 'fas fa-moon'
    };
    return iconMap[key] || 'fas fa-map-marker-alt';
}

function createItineraryItem(key, schedule) {
    const labels = {
        'arrival': '✈️ 공항도착',
        'departure': '✈️ 공항출발',
        'hotel': '🏨 숙소체크인',
        'breakfast': '🌅 아침식사',
        'morning': '☀️ 오전일정',
        'lunch': '🍽️ 점심식사',
        'afternoon': '🌤️ 오후일정',
        'afternoon1': '🌤️ 오후일정1',
        'afternoon2': '🌤️ 오후일정2',
        'afternoon3': '🌤️ 오후일정3',
        'dinner': '🍴 저녁식사',
        'evening': '🌙 저녁일정',
        'evening1': '🌙 저녁일정1',
        'evening2': '🌙 저녁일정2'
    };
    
    const label = labels[key] || '📅 일정';
    const isClickable = key !== 'hotel' && key !== 'arrival' && key !== 'departure';
    const itemClass = getScheduleItemClass(key);
    
    let html = `<div class="itinerary-item ${key} ${isClickable ? 'clickable' : ''} ${itemClass}" data-location="${schedule.location}">`;
    html += `<div class="itinerary-time">${label} • ${schedule.time}</div>`;
    html += `<div class="itinerary-location">${schedule.location}</div>`;
    html += `<div class="itinerary-description">${schedule.description}</div>`;
    
    if (schedule.alternative) {
        html += `<div class="itinerary-alternative">💡 ${schedule.alternative}</div>`;
    }
    
    html += '</div>';
    
    return html;
}

function getScheduleItemClass(key) {
    // 식사 관련
    if (['breakfast', 'lunch', 'dinner'].includes(key)) {
        return 'meal-item';
    }
    // 관광지 관련
    else if (['morning', 'afternoon', 'afternoon1', 'afternoon2', 'afternoon3', 'evening', 'evening1', 'evening2'].includes(key)) {
        return 'attraction-item';
    }
    // 교통 관련
    else if (['arrival', 'departure'].includes(key)) {
        return 'transport-item';
    }
    // 숙소 관련
    else if (['hotel', 'hotel_return'].includes(key)) {
        return 'hotel-item';
    }
    return '';
}

function addItineraryClickListeners() {
    const clickableItems = document.querySelectorAll('.itinerary-item.clickable');
    
    clickableItems.forEach(item => {
        item.addEventListener('click', () => {
            const location = item.getAttribute('data-location');
            zoomToLocation(location);
        });
    });
}

function zoomToLocation(location) {
    if (!allMarkers || !map) return;
    
    // 해당 위치의 마커 찾기
    let targetMarker = null;
    
    allMarkers.forEach(markerInfo => {
        const place = markerInfo.place;
        const marker = markerInfo.marker;
        
        const markerName = place.name.split('/')[0].trim();
        const koreanName = extractKorean(markerName);
        const englishName = extractEnglishName(markerName);
        const chineseName = extractChineseName(markerName);
        
        if (location.includes(markerName) || 
            markerName.includes(location) ||
            location.includes(koreanName) ||
            location.includes(englishName) ||
            location.includes(chineseName) ||
            koreanName.includes(location) ||
            englishName.includes(location) ||
            chineseName.includes(location)) {
            // 현재 지도에 올라온 레이어를 우선 선택 (dot 또는 normal)
            if (clusterGroups.all.hasLayer(markerInfo.marker)) {
                targetMarker = markerInfo.marker;
            } else if (clusterGroups.all.hasLayer(markerInfo.dot)) {
                targetMarker = markerInfo.dot;
            } else {
                // 기본값으로 일반 마커
                targetMarker = markerInfo.marker;
            }
        }
    });
    
    if (targetMarker) {
        const latlng = targetMarker.getLatLng();
        map.setView(latlng, 16, {
            animate: true,
            duration: 1
        });
        
        // 마커에 임시 하이라이트 효과 (Marker/CircleMarker 호환)
        if (typeof targetMarker.setZIndexOffset === 'function') {
            targetMarker.setZIndexOffset(1000);
            setTimeout(() => targetMarker.setZIndexOffset(0), 2000);
        } else if (typeof targetMarker.bringToFront === 'function' && typeof targetMarker.bringToBack === 'function') {
            targetMarker.bringToFront();
            setTimeout(() => targetMarker.bringToBack(), 2000);
        }
        
        console.log('줌 이동:', location);
        
        // 팝업 닫기
        document.getElementById('itinerary-popup').classList.remove('show');
        
        // 마커 팝업 열기 (클러스터 미사용 환경 호환)
        if (typeof targetMarker.openPopup === 'function') {
            targetMarker.openPopup();
        }
    } else {
        console.log('마커를 찾을 수 없음:', location);
    }
}

function filterMarkersByDay(selectedDay) {
    if (!map || !allMarkers.length) return;

    console.log('필터링 시작:', selectedDay);

    // 모든 레이어 그룹 초기화
    Object.values(clusterGroups).forEach(group => group.clearLayers());

    let dayLocations = [];
    if (selectedDay !== 'all' && window.itineraryData[selectedDay]) {
        const dayData = window.itineraryData[selectedDay];
        Object.values(dayData).forEach(item => {
            if (item && item.location) {
                dayLocations.push(item.location);
            }
        });
    }

    console.log('일정 장소들:', dayLocations);

    let visibleCount = 0;
    allMarkers.forEach(markerInfo => {
        const place = markerInfo.place;
        const marker = markerInfo.marker; // 일반 마커
        
        const isVisible = selectedDay === 'all' || dayLocations.some(loc => {
            const placeName = place.name.split('/')[0].trim();
            
            // 다양한 매칭 방법 시도
            const placeKorean = extractKorean(placeName);
            const placeEnglish = extractEnglishName(placeName);
            const placeChinese = extractChineseName(placeName);
            
            const locKorean = extractKorean(loc);
            const locEnglish = extractEnglishName(loc);
            const locChinese = extractChineseName(loc);
            
            // 정확한 매칭
            if (placeName.includes(loc) || loc.includes(placeName)) {
                console.log('정확한 매칭:', placeName, '↔', loc);
                return true;
            }
            
            // 한글명 매칭
            if (placeKorean && locKorean && 
                (placeKorean.includes(locKorean) || locKorean.includes(placeKorean))) {
                console.log('한글명 매칭:', placeKorean, '↔', locKorean);
                return true;
            }
            
            // 영문명 매칭
            if (placeEnglish && locEnglish && 
                (placeEnglish.toLowerCase().includes(locEnglish.toLowerCase()) || 
                 locEnglish.toLowerCase().includes(placeEnglish.toLowerCase()))) {
                console.log('영문명 매칭:', placeEnglish, '↔', locEnglish);
                return true;
            }
            
            // 중국어명 매칭
            if (placeChinese && locChinese && 
                (placeChinese.includes(locChinese) || locChinese.includes(placeChinese))) {
                console.log('중국어명 매칭:', placeChinese, '↔', locChinese);
                return true;
            }
            
            return false;
        });

        if (isVisible) {
            if (clusterGroups.all) {
                // 초기에는 일반 마커를 추가하고, 혼잡도 함수에서 점으로 전환
                clusterGroups.all.addLayer(markerInfo.marker);
                visibleCount++;
                console.log('마커 표시:', place.name, '(타입:', place.type, ')');
            }
        }
    });

    console.log('표시된 마커 수:', visibleCount);
    updateLabelVisibility();
}

function showDayBottomSheet(dayKey) {
    displayItinerary(dayKey);
}

function setupDragToExpand(bottomSheet) {
    const dragHandle = bottomSheet.querySelector('.drag-handle');
    let startY = 0;
    let startHeight = 0;
    let isDragging = false;
    
    dragHandle.addEventListener('mousedown', (e) => {
        startY = e.clientY;
        startHeight = bottomSheet.offsetHeight;
        isDragging = true;
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaY = startY - e.clientY;
        const newHeight = Math.max(40, Math.min(100, startHeight + deltaY));
        
        if (newHeight >= 80) {
            bottomSheet.classList.add('expanded');
        } else {
            bottomSheet.classList.remove('expanded');
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
        }
    });
    
    // 터치 이벤트 지원
    dragHandle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        startHeight = bottomSheet.offsetHeight;
        isDragging = true;
        e.preventDefault();
    });
    
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        const deltaY = startY - e.touches[0].clientY;
        const newHeight = Math.max(40, Math.min(100, startHeight + deltaY));
        
        if (newHeight >= 80) {
            bottomSheet.classList.add('expanded');
        } else {
            bottomSheet.classList.remove('expanded');
        }
        e.preventDefault();
    });
    
    document.addEventListener('touchend', () => {
        isDragging = false;
    });
}

// 지도 클릭 시 하단 팝업 닫기
function setupMapClickToClosePopup() {
    if (window.map) {
        map.on('click', function() {
            const bottomSheet = document.getElementById('bottom-sheet');
            if (bottomSheet) bottomSheet.classList.remove('show');
            filterMarkersByDay('all'); // 지도 클릭 시 마커 전체 복원
        });
    }
}

// 일정 제목 업데이트 함수
function updateItineraryTitle(selectedDay, totalCost) {
    const titleElem = document.querySelector('.itinerary-title');
    if (!titleElem) return;
    if (selectedDay === 'all') {
        titleElem.textContent = `전체 일정 (총 비용: ${totalCost}위안)`;
    } else {
        titleElem.textContent = `${selectedDay}일차 일정 (총 비용: ${totalCost}위안)`;
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log('메인 페이지 로드 완료');
    initMap();
});

// 팝업 닫힘 이벤트는 initMap에서 바인딩

// ---------------- Mobile Horizontal Timeline -----------------
function initMobileTimeline() {
    const container = document.getElementById('mobile-timeline');
    if (!container) return;

    const tabs = document.getElementById('mt-tabs');
    const days = ['all', 'day1', 'day2', 'day3', 'day4'];
    tabs.innerHTML = '';
    days.forEach(d => {
        const btn = document.createElement('button');
        btn.className = 'mt-tab' + (d === 'all' ? ' active' : '');
        btn.dataset.day = d;
        btn.textContent = d === 'all' ? '전체' : d.replace('day', '') + '일차';
        btn.addEventListener('click', () => {
            tabs.querySelectorAll('.mt-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderMobileTimeline(d);
            filterMarkersByDay(d);
        });
        tabs.appendChild(btn);
    });

    // 기본 디폴트는 전체
    renderMobileTimeline('all');
    filterMarkersByDay('all');
}

function renderMobileTimeline(dayKey) {
    const scroll = document.getElementById('mt-scroll');
    if (!scroll || !window.itineraryData) return;
    scroll.innerHTML = '';

    const data = buildMobileTimelineData(dayKey);
    const centers = [];
    const badges = [];
    const labelsDist = [];
    const dayLabels = [];
    const cards = [];
    data.forEach((item, idx) => {
        const node = document.createElement('div');
        node.className = 'mt-node';
        const dotWrap = document.createElement('div');
        dotWrap.className = 'mt-dot-wrap';
        const dot = document.createElement('div');
        dot.className = 'mt-dot';
        dotWrap.appendChild(dot);

        const card = document.createElement('div');
        card.className = 'mt-card';
        const time = document.createElement('div');
        time.className = 'mt-time';
        time.textContent = item.time || '';
        const place = document.createElement('div');
        place.className = 'mt-place';
        place.textContent = displayLocationForSchedule(item.location);
        card.appendChild(time);
        card.appendChild(place);
        const menuInfo = getMenuBadgeInfo(item.location);
        if (menuInfo.text) {
            const menuDiv = document.createElement('div');
            menuDiv.className = 'mt-menu-badge';
            const span = document.createElement('span');
            span.className = 'menu-badge';
            if (menuInfo.cls) span.className += ` ${menuInfo.cls}`;
            span.textContent = menuInfo.text;
            menuDiv.appendChild(span);
            card.appendChild(menuDiv);
        }
        // 비용 표시는 모바일 가로 일정표에서 제외

        card.addEventListener('click', () => {
            zoomToLocation(item.location);
        });

        node.appendChild(dotWrap);
        node.appendChild(card);
        scroll.appendChild(node);
        // 임시로 DOM에 추가 후 좌표 계산을 위해 저장 (계산은 다음 렌더 프레임에서)
        centers.push({ dot });
        if (idx < data.length - 1) {
            badges.push(item.moveBadge || '');
            labelsDist.push(item.moveDistance || '');
        }
        dayLabels.push(item.day || '');
        cards.push(card);
    });

    // 다음 프레임에서 트랙과 이동 라벨 절대 배치
    requestAnimationFrame(() => layoutMobileTrackAndLabels(scroll, centers, badges, labelsDist, dayLabels, dayKey, cards));
}

function layoutMobileTrackAndLabels(scroll, centers, badges, labelsDist, dayLabels, dayKey, cards) {
    // 기존 트랙/라벨 제거
    scroll.querySelectorAll('.mt-track, .mt-move-abs, .mt-daybox, .mt-range-label, .mt-day-arrow, .mt-day-arrow-label, .mt-day-badge').forEach(el => el.remove());

    if (centers.length === 0) return;
    const scrollRect = scroll.getBoundingClientRect();

    const toContentX = (dotEl) => {
        const r = dotEl.getBoundingClientRect();
        return scroll.scrollLeft + (r.left - scrollRect.left) + r.width / 2;
    };
    const toContentY = (el) => {
        const r = el.getBoundingClientRect();
        return (r.top - scrollRect.top) + r.height / 2; // content y within scroll
    };
    const elTop = (el) => {
        const r = el.getBoundingClientRect();
        return (r.top - scrollRect.top);
    };
    const elBottom = (el) => {
        const r = el.getBoundingClientRect();
        return (r.bottom - scrollRect.top);
    };

    const firstX = toContentX(centers[0].dot);
    const lastX = toContentX(centers[centers.length - 1].dot);
    const y = toContentY(centers[0].dot);

    const track = document.createElement('div');
    track.className = 'mt-track';
    track.style.left = `${firstX}px`;
    track.style.top = `${y}px`;
    track.style.width = `${Math.max(0, lastX - firstX)}px`;
    scroll.appendChild(track);

    // 이동 라벨: 각 구간 중간 지점에 배치 (배지는 선 위, 거리는 선 아래)
    for (let i = 0; i < centers.length - 1; i++) {
        const a = toContentX(centers[i].dot);
        const b = toContentX(centers[i + 1].dot);
        const mid = (a + b) / 2;
        const badgeHtml = badges[i];
        const distText = labelsDist[i];
        if (badgeHtml) {
            const topEl = document.createElement('div');
            topEl.className = 'mt-move-abs';
            topEl.style.left = `${mid}px`;
            topEl.style.top = `${y - 20}px`; // 이전 버전으로 복원
            topEl.innerHTML = badgeHtml;
            scroll.appendChild(topEl);
        }
        if (distText) {
            const bottomEl = document.createElement('div');
            bottomEl.className = 'mt-move-abs';
            bottomEl.style.left = `${mid}px`;
            bottomEl.style.top = `${y + 5}px`; // 선 아래쪽 5px 간격
            bottomEl.textContent = distText;
            scroll.appendChild(bottomEl);
        }
    }

    // 전체 보기에서 각 일자별 범위를 하단 화살표 라인으로 표시
    if (dayKey === 'all' && dayLabels && dayLabels.length === centers.length) {
        const groups = [];
        let start = 0;
        for (let i = 1; i <= dayLabels.length; i++) {
            if (i === dayLabels.length || dayLabels[i] !== dayLabels[i - 1]) {
                groups.push({ start, end: i - 1, day: dayLabels[i - 1] });
                start = i;
            }
        }
        groups.forEach(g => {
            const leftX = toContentX(centers[g.start].dot);
            const rightX = toContentX(centers[g.end].dot);
            const mid = (leftX + rightX) / 2;
            // 각 일자 범위 내 카드의 가장 아래쪽을 기준으로 화살표 위치 결정
            const bottoms = cards.slice(g.start, g.end + 1).map(elBottom);
            const baseY = Math.max(...bottoms);
            const arrow = document.createElement('div');
            arrow.className = 'mt-day-arrow';
            arrow.style.left = `${leftX}px`;
            const arrowTop = baseY + 28; // 카드 하단 아래 간격을 더 내려서 여유 확보
            arrow.style.top = `${arrowTop}px`;
            arrow.style.width = `${Math.max(0, rightX - leftX)}px`;
            scroll.appendChild(arrow);

            // 일자 텍스트 뱃지 (화살표 위에 얹기)
            const label = document.createElement('div');
            label.className = 'mt-day-badge';
            label.style.left = `${mid}px`;
            label.style.top = `${arrowTop}px`; // 라인 중앙에 배치 (transform로 수직 중앙 정렬)
            const dayText = (g.day === 'day1') ? '1일차' : (g.day === 'day2') ? '2일차' : (g.day === 'day3') ? '3일차' : (g.day === 'day4') ? '4일차' : g.day;
            label.textContent = dayText;
            scroll.appendChild(label);
        });
    }

    // 리사이즈 시 재배치
    window.addEventListener('resize', () => {
        requestAnimationFrame(() => layoutMobileTrackAndLabels(scroll, centers, badges, labelsDist, dayLabels, dayKey));
    }, { once: true });
}

function buildMobileTimelineData(dayKey) {
    const out = [];
    if (!window.itineraryData) return out;

    const pushDay = (ds, dayLabel) => {
        const entries = Object.entries(ds).sort((a,b)=> (a[1].time||'00:00').localeCompare(b[1].time||'00:00'));
        for (let i=0;i<entries.length;i++) {
            const [key, schedule] = entries[i];
            const next = entries[i+1]?.[1];
            const item = {
                time: schedule.time || '',
                location: schedule.location || '',
                day: dayLabel || dayKey
            };
            // 모바일 가로 일정표에서는 비용 표시를 제외
            // 점 사이 이동 정보: 다음 항목의 거리/이동수단 배지 사용 (비용은 제외)
            if (next) {
                const dist = (next.distance && next.distance !== null) ? String(next.distance) : '';
                // 이동수단 배지 결정: moveMode 우선, 없으면 transport 문자열 내 괄호 텍스트 참고
                let mode = next.moveMode || '';
                if (!mode && next.cost?.transport && /\(([^)]+)\)/.test(String(next.cost.transport))) {
                    mode = String(next.cost.transport).match(/\(([^)]+)\)/)[1];
                }
                let badgeClass = '';
                if (mode.includes('공항픽업') || mode.includes('공항샌딩')) badgeClass = 'wine';
                else if (mode.includes('도보')) badgeClass = 'walk';
                else if (mode.includes('패키지')) badgeClass = 'wine';
                else if (mode.includes('택시') || mode.includes('디디')) badgeClass = 'taxi';
                const badge = mode ? `<span class="mt-badge ${badgeClass}">${mode}</span>` : '';
                item.moveBadge = badge;
                item.moveDistance = dist ? `${dist}` : '';
            }
            out.push(item);
        }
    };

    if (dayKey === 'all') {
        for (let i=1;i<=4;i++) {
            const dk = `day${i}`;
            const ds = window.itineraryData[dk];
            if (ds) pushDay(ds, dk);
        }
    } else {
        const ds = window.itineraryData[dayKey];
        if (ds) pushDay(ds, dayKey);
    }
    return out;
}
