// Global Variables
let map;
let markers = L.featureGroup();
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
    attractions: '#ea4335', // 관광지
    restaurants: '#34a853', // 음식점
    airports: '#9b59b6',    // 공항
    hotels: '#1a73e8'       // 호텔
};


// 문서 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await loadData(); // 데이터 로드
    initializeMap();  // 지도 초기화
    setupEventListeners(); // 이벤트 리스너 설정
});

// 데이터 로드 함수
async function loadData() {
    try {
        const response = await fetch('data/shanghai-data.json');
        shanghaiData = await response.json();
        console.log('데이터 로드 완료:', shanghaiData);
    } catch (error) {
        console.error('데이터 로드 실패:', error);
        // 데이터 로드 실패 시 빈 데이터로 초기화
        shanghaiData = {
            shanghai_tourism: {
                attractions: [],
                restaurants: [],
                hotels: [],
                airports: []
            }
        };
    }
}

// 한글 추출 함수
function extractKorean(text) {
    // 괄호 안의 한글 부분을 먼저 찾기
    const koreanInParentheses = text.match(/\(([가-힣\s]+)\)/);
    if (koreanInParentheses && koreanInParentheses[1].trim() !== '') {
        return koreanInParentheses[1].trim();
    }

    // 괄호가 없다면 전체 텍스트에서 한글 부분 추출
    const koreanParts = text.match(/[가-힣\s]+/g);
    if (koreanParts && koreanParts.length > 0) {
        // 비어있는 문자열 필터링 후 첫 번째 비어있지 않은 한글 부분 반환
        const filteredParts = koreanParts.filter(part => part.trim() !== '');
        if (filteredParts.length > 0) {
            return filteredParts[0].trim();
        }
    }

    // 한글이 없다면 원본 텍스트 반환
    return text;
}

// 지도 초기화 함수
function initializeMap() {
    // 지도 초기화 (상하이 중심, 초기 줌 레벨 12)
    map = L.map('map').setView([31.2304, 121.4737], 12);

    // 다양한 타일 레이어 정의
    const tileLayers = {
        cartodb: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }),
        street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© <a href="https://www.esri.com/">Esri</a>, Maxar, GeoEye, Earthstar Geographics',
            maxZoom: 19
        })
    };

    // 기본 심플 타일 레이어 추가
    currentTileLayer = tileLayers.cartodb;
    currentTileLayer.addTo(map);

    // 타일 레이어 변경 이벤트 리스너
    document.querySelectorAll('input[name="tile-layer"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                map.removeLayer(currentTileLayer);
                currentTileLayer = tileLayers[this.value];
                currentTileLayer.addTo(map);

                // 현재 선택된 타일 옵션에 'active' 클래스 추가
                document.querySelectorAll('.tile-option').forEach(option => {
                    option.classList.remove('active');
                });
                this.parentElement.classList.add('active');
            }
        });
    });

    // 마커 그룹들을 지도에 추가
    Object.values(markerGroups).forEach(group => {
        group.addTo(map);
    });

    // 마커 표시
    displayMarkers();

    // 줌 레벨 변경 시 라벨 가시성 업데이트 (디바운싱 적용)
    map.on('zoomend', () => {
        // 기존 타이머가 있다면 취소
        if (labelUpdateTimeout) {
            clearTimeout(labelUpdateTimeout);
        }
        
        // 100ms 후에 라벨 업데이트 (부드러운 전환을 위해)
        labelUpdateTimeout = setTimeout(() => {
            updateLabelVisibility();
        }, 100);
    });

    // 지도 로드 후 초기 라벨 가시성 설정
    map.whenReady(() => {
        // 약간의 지연을 주어 모든 마커와 툴팁이 완전히 렌더링된 후 실행
        setTimeout(() => {
            updateLabelVisibility();
        }, 200);
    });
}

// 이벤트 리스너 설정 함수
function setupEventListeners() {
    // ESC 키로 정보 박스 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeInfoBox();
        }
    });

    // 지도 클릭 시 정보 박스 닫기 (마커나 팝업 등이 아닌 순수 지도 배경 클릭 시)
    map.on('click', (e) => {
        if (e.originalEvent && e.originalEvent.target === map.getContainer()) {
            closeInfoBox();
        }
    });

    // 범례 체크박스 이벤트 리스너
    document.getElementById('attractions-toggle').addEventListener('change', function() {
        toggleMarkerGroup('attractions', this.checked);
    });
    document.getElementById('restaurants-toggle').addEventListener('change', function() {
        toggleMarkerGroup('restaurants', this.checked);
    });
    document.getElementById('hotels-toggle').addEventListener('change', function() {
        toggleMarkerGroup('hotels', this.checked);
    });
    document.getElementById('airports-toggle').addEventListener('change', function() {
        toggleMarkerGroup('airports', this.checked);
    });

    // 위치 찾기 버튼 이벤트 리스너
    document.getElementById('locate-btn').addEventListener('click', function() {
        findMyLocation();
    });
}

// 마커 그룹 토글 함수 (범례 체크박스와 연동)
function toggleMarkerGroup(type, show) {
    if (show) {
        markerGroups[type].addTo(map);
    } else {
        map.removeLayer(markerGroups[type]);
    }

    // 그룹 가시성 변경 후 라벨 가시성 업데이트 (디바운싱 적용)
    if (labelUpdateTimeout) {
        clearTimeout(labelUpdateTimeout);
    }
    
    // 150ms 후에 라벨 업데이트 (레이어 변경 후 부드러운 전환을 위해)
    labelUpdateTimeout = setTimeout(() => {
        updateLabelVisibility();
    }, 150);
}

// 마커 표시 함수
function displayMarkers() {
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('마커를 표시할 데이터가 없습니다.');
        return;
    }

    // 기존 마커들 제거 및 배열 초기화
    Object.values(markerGroups).forEach(group => {
        group.clearLayers();
    });
    allMarkers = [];

    // 모든 장소 데이터를 하나의 배열로 합치기
    const allPlaces = [];
    const types = ['attractions', 'restaurants', 'hotels', 'airports'];

    types.forEach(type => {
        const places = shanghaiData.shanghai_tourism[type];
        places.forEach(place => {
            allPlaces.push({...place, type: type});
        });
    });

    // 위치(좌표)별로 장소들을 그룹화 (동일 좌표에 여러 장소가 있을 수 있으므로)
    const locationGroups = {};

    allPlaces.forEach(place => {
        // 부동 소수점 문제 방지를 위해 위도, 경도 정밀도를 고정하여 키 생성
        const lat = parseFloat(place.latitude).toFixed(4);
        const lng = parseFloat(place.longitude).toFixed(4);
        const locationKey = `${lat},${lng}`;

        if (!locationGroups[locationKey]) {
            locationGroups[locationKey] = {
                latitude: place.latitude,
                longitude: place.longitude,
                places: [] // 이 위치에 해당하는 모든 장소들
            };
        }
        locationGroups[locationKey].places.push(place);
    });

    // 각 위치 그룹에 대해 마커 생성
    Object.values(locationGroups).forEach(group => {
        // 동일 좌표에 여러 타입의 장소가 있을 경우, 아이콘 표시 우선순위를 결정
        const priorityOrder = { 'airports': 1, 'attractions': 2, 'hotels': 3, 'restaurants': 4 };
        const mainType = group.places.reduce((prev, curr) =>
            (priorityOrder[prev.type] < priorityOrder[curr.type] ? prev : curr)
        ).type;

        // 마커 생성 및 해당 마커 그룹에 추가
        // 식당의 경우 메뉴 정보를 전달하여 아이콘 결정
        let iconPlace = null;
        if (mainType === 'restaurants') {
            // 식당인 경우 첫 번째 식당 정보를 전달 (메뉴 분석용)
            iconPlace = group.places.find(place => place.type === 'restaurants');
        }
        
        const marker = L.marker([group.latitude, group.longitude], {
            icon: createCustomIcon(mainType, iconPlace)
        }).addTo(markerGroups[mainType]);

        // 라벨 텍스트 생성 (한글 부분만 추출)
        let labelText;
        if (group.places.length === 1) {
            const place = group.places[0];
            labelText = extractKorean(place.name);
            // 호텔 카테고리이고 가격 정보가 있을 경우 가격 추가 및 개행 처리
            if (place.type === 'hotels' && place.price) {
                // 천원 단위 콤마와 원화 기호 추가
                const formattedPrice = `₩${parseInt(place.price).toLocaleString('ko-KR')}`;
                labelText += `<br><span style="font-size:0.8em; color:#555;">${formattedPrice}</span>`;
            }
        } else {
            const firstPlaceName = extractKorean(group.places[0].name);
            labelText = `${firstPlaceName} 외 ${group.places.length - 1}곳`;
        }

        // 마커 클릭 시 정보 박스 표시 및 지도를 해당 위치로 이동
        marker.on('click', () => {
            displayGroupDetails(group);
            map.flyTo([group.latitude, group.longitude], 15); // 클릭 시 줌 레벨 15로 확대
        });

        // 툴팁(라벨)을 마커 하단에 바인딩하고 동적으로 스타일 적용
        marker.bindTooltip(labelText, {
            permanent: true, // 항상 툴팁이 활성화되도록 설정 (CSS로 가시성 제어)
            direction: 'bottom', // 라벨을 마커 하단에 배치
            offset: [0, 15], // 마커 중앙에서 아래로 15px 이동
            className: 'leaflet-tooltip', // 커스텀 라벨 스타일 클래스 적용
            opacity: 0 // 초기에는 CSS로 투명하게 설정 (나중에 나타나도록)
        });

        // 라벨 가시성 제어를 위해 마커 정보를 배열에 저장
        allMarkers.push({
            marker: marker,
            labelText: labelText,
            group: group,
            labelVisible: false, // 초기 라벨 가시성 상태
            groupType: mainType,
            tooltipElement: null // 나중에 설정될 예정
        });
    });

    // 모든 마커를 포함하도록 지도 뷰를 조정
    const allMarkersLayer = L.featureGroup();
    Object.values(markerGroups).forEach(group => {
        group.getLayers().forEach(layer => {
            allMarkersLayer.addLayer(layer);
        });
    });

    if (allMarkersLayer.getLayers().length > 0) {
        map.fitBounds(allMarkersLayer.getBounds().pad(0.1));
    }

    // 툴팁 엘리먼트들이 DOM에 추가된 후에 참조를 설정
    setTimeout(() => {
        allMarkers.forEach((markerData, index) => {
            const tooltipElements = document.querySelectorAll('.leaflet-tooltip');
            if (tooltipElements[index]) {
                markerData.tooltipElement = tooltipElements[index];
                // 툴팁의 왼쪽 테두리 색상을 마커의 타입에 따라 동적으로 설정
                markerData.tooltipElement.style.borderLeft = `4px solid ${markerColors[markerData.groupType] || '#3498db'}`;
            }
        });
        // 툴팁 엘리먼트 설정 후 라벨 가시성 업데이트
        updateLabelVisibility();
    }, 100);
}

// 내 위치 찾기 함수
function findMyLocation() {
    const locateBtn = document.getElementById('locate-btn');
    const icon = locateBtn.querySelector('i');

    // 로딩 상태로 변경
    icon.className = 'fas fa-spinner fa-spin'; // 로딩 스피너 아이콘
    locateBtn.disabled = true; // 버튼 비활성화

    if (!navigator.geolocation) {
        alert('이 브라우저에서는 위치 서비스가 지원되지 않습니다.');
        resetLocateButton();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // 지도를 현재 위치로 이동 및 확대
            map.setView([lat, lng], 15);

            // 기존 현재 위치 마커 제거
            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
            }

            // 현재 위치 마커 생성
            currentLocationMarker = L.marker([lat, lng], {
                icon: createCurrentLocationIcon()
            }).addTo(map);

            // 현재 위치 마커에 툴팁 바인딩
            const currentLocationTooltip = currentLocationMarker.bindTooltip('현재 위치', {
                permanent: false, // 현재 위치 라벨은 영구적이지 않음 (클릭 시 사라짐)
                direction: 'top', // 마커 상단에 배치
                offset: [0, -25],
                className: 'leaflet-tooltip current-location-label' // 커스텀 클래스 적용
            }).openTooltip(); // 툴팁 즉시 표시

            // 현재 위치 라벨 테두리 색상 설정
            currentLocationTooltip.getElement().style.borderLeft = `4px solid #1a73e8`; // 파란색 테두리

            resetLocateButton(); // 버튼 상태 리셋
        },
        function(error) {
            let errorMessage = '위치를 찾을 수 없습니다.';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = '위치 접근이 거부되었습니다.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = '위치 정보를 사용할 수 없습니다.';
                    break;
                case error.TIMEOUT:
                    errorMessage = '위치 요청 시간이 초과되었습니다.';
                    break;
            }
            alert(errorMessage);
            resetLocateButton();
        },
        {
            enableHighAccuracy: true,  // 고정밀 위치 정보 요청
            timeout: 10000,            // 10초 타임아웃
            maximumAge: 60000          // 1분 이내 캐시된 위치 정보 사용
        }
    );
}

// 위치 찾기 버튼 상태 리셋 함수
function resetLocateButton() {
    const locateBtn = document.getElementById('locate-btn');
    const icon = locateBtn.querySelector('i');

    icon.className = 'fas fa-location-crosshairs'; // 기본 아이콘으로 변경
    locateBtn.disabled = false; // 버튼 활성화
}

// 현재 위치 마커 아이콘 생성 함수
function createCurrentLocationIcon() {
    return L.divIcon({
        className: 'current-location-marker',
        html: `<div class="location-pulse">
                 <div class="location-dot"></div>
               </div>`,
        iconSize: [20, 20], // 아이콘 크기
        iconAnchor: [10, 10] // 아이콘 기준점 (중앙)
    });
}

// 줌 레벨 및 그룹 가시성에 따라 라벨 가시성 업데이트 함수
function updateLabelVisibility() {
    const currentZoom = map.getZoom();

    // 라벨이 나타나기 시작할 최소 줌 레벨 설정
    // 이 값을 조정하여 라벨 표시 시점을 제어합니다. (예: 14, 15, 16)
    const minZoomForLabels = 14; // 줌 레벨 14 이상에서 라벨 표시

    console.log(`현재 줌 레벨: ${currentZoom}, 라벨 표시 최소 줌: ${minZoomForLabels}`);

    allMarkers.forEach((markerData, index) => {
        // 해당 마커의 그룹이 현재 지도에 보이는지 확인
        const isGroupVisible = map.hasLayer(markerGroups[markerData.groupType]);
        const tooltipElement = markerData.tooltipElement; // 저장된 툴팁 DOM 엘리먼트 참조

        // 툴팁 엘리먼트가 존재하는지 확인
        if (!tooltipElement) {
            console.warn(`마커 ${index}의 툴팁 엘리먼트를 찾을 수 없습니다.`);
            return;
        }

        // 현재 줌 레벨이 라벨 표시 최소 줌 레벨 이상이고, 해당 그룹이 보이는 상태일 때
        if (currentZoom >= minZoomForLabels && isGroupVisible) {
            if (!markerData.labelVisible) {
                // 라벨이 보이도록 'show-label' CSS 클래스 추가
                tooltipElement.classList.add('show-label');
                markerData.labelVisible = true;
                console.log(`마커 ${index} 라벨 표시`);
            }
        } else {
            // 라벨 숨기기
            if (markerData.labelVisible) {
                // 라벨이 숨겨지도록 'show-label' CSS 클래스 제거
                tooltipElement.classList.remove('show-label');
                markerData.labelVisible = false;
                console.log(`마커 ${index} 라벨 숨김`);
            }
        }
    });
}

// 메뉴 기반 식당 카테고리 분류 함수
function getRestaurantCategory(place) {
    if (place.type !== 'restaurants' || !place.menu || place.menu.length === 0) {
        return 'general'; // 기본 식당
    }

    const menuText = place.menu.join(' ').toLowerCase();
    
    // 딤섬/만두류 (샤오롱바오, 셩지엔, 만두, 딤섬 등)
    if (menuText.includes('샤오롱바오') || menuText.includes('셩지엔') || 
        menuText.includes('만두') || menuText.includes('딤섬') || 
        menuText.includes('하가우') || menuText.includes('시우마이') ||
        menuText.includes('게살샤오롱바오') || menuText.includes('단황시엔')) {
        return 'dumpling';
    }
    
    // 면 요리 (국수, 미엔, 면 등)
    if (menuText.includes('미엔') || menuText.includes('국수') || 
        menuText.includes('면') || menuText.includes('황유미엔') ||
        menuText.includes('따창미엔') || menuText.includes('시아런미엔') ||
        menuText.includes('볶음밥') || menuText.includes('창펀')) {
        return 'noodle';
    }
    
    // 해산물 (게, 새우, 조기 등)
    if (menuText.includes('게') || menuText.includes('새우') || 
        menuText.includes('조기') || menuText.includes('굴전') ||
        menuText.includes('게살') || menuText.includes('랍스터')) {
        return 'seafood';
    }
    
    // 훠궈/탕류 (훠궈, 탕, 토마토탕 등)
    if (menuText.includes('훠궈') || menuText.includes('탕') || 
        menuText.includes('마라') || menuText.includes('백탕') ||
        menuText.includes('토마토') || menuText.includes('하이디라오')) {
        return 'hotpot';
    }
    
    // 고급 중식/오리 요리 (북경오리, 거지닭, 동파육 등)
    if (menuText.includes('북경오리') || menuText.includes('거지닭') || 
        menuText.includes('叫化鸡') || menuText.includes('동파육') ||
        menuText.includes('마파두부') || menuText.includes('카오야') ||
        menuText.includes('오리') || menuText.includes('천황')) {
        return 'chinese';
    }
    
    // 대만 요리
    if (menuText.includes('대만') || menuText.includes('파인애플볶음밥') ||
        menuText.includes('허자이지엔')) {
        return 'taiwanese';
    }
    
    return 'general'; // 기타 일반 식당
}
    let iconClass, bgClass; // 아이콘 클래스와 배경색 클래스

    // 타입에 따라 아이콘과 배경색 클래스 결정
    switch (type) {
        case 'attractions':
            iconClass = 'fas fa-camera';
            bgClass = 'tourism-bg';
            break;
        case 'restaurants':
            iconClass = 'fas fa-utensils';
            bgClass = 'restaurant-bg';
            break;
        case 'airports':
            iconClass = 'fas fa-plane';
            bgClass = 'airport-bg';
            break;
        case 'hotels':
            iconClass = 'fas fa-bed';
            bgClass = 'accommodation-bg';
            break;
        default: // 기본값
            iconClass = 'fas fa-map-marker-alt';
            bgClass = 'tourism-bg';
    }

    // L.divIcon을 사용하여 커스텀 HTML 기반 마커 생성
    return L.divIcon({
        className: 'google-circle-marker', // 마커 컨테이너 클래스
        html: `<div class="circle-marker ${bgClass}">
                 <i class="${iconClass}"></i>
               </div>`, // 마커 내부 HTML (원형 배경과 아이콘)
        iconSize: [18, 18], // 마커 전체 크기 (가로, 세로)
        iconAnchor: [9, 9] // 아이콘 기준점 (중앙)
    });
}

// 그룹 상세 정보 표시 함수 (클릭 시 정보 박스에 내용 채우기)
function displayGroupDetails(group) {
    const infoBox = document.getElementById('place-details');
    const placeContent = document.getElementById('place-content');

    let detailsHtml = '';

    if (group.places.length === 1) {
        // 단일 장소인 경우
        const place = group.places[0];
        detailsHtml = `
            <div class="place-type-badge type-${place.type}">
                ${getTypeIcon(place.type, place)} ${getTypeDisplayName(place.type)}
            </div>
            <h3><i class="fas fa-map-marker-alt"></i> ${place.name}</h3>
        `;

        if (place.description) {
            detailsHtml += `<p><strong>🎯 설명:</strong> ${place.description}</p>`;
        }

        if (place.address && place.address !== "N/A") {
            detailsHtml += `<p><strong>📍 주소:</strong> ${place.address}</p>`;
        }

        if (place.features && place.features.length > 0) {
            detailsHtml += `<p><strong>✨ 특징:</strong> ${place.features.join(', ')}</p>`;
        }

        if (place.menu && place.menu.length > 0) {
            detailsHtml += `<p><strong>🍽️ 메뉴:</strong></p><ul>`;
            place.menu.forEach(item => {
                detailsHtml += `<li>${item}</li>`;
            });
            detailsHtml += `</ul>`;
        }
        // 호텔 가격 정보 표시 (단일 장소)
        if (place.type === 'hotels' && place.price) {
            const formattedPrice = `₩${parseInt(place.price).toLocaleString('ko-KR')}`;
            detailsHtml += `<p><strong>💰 가격:</strong> ${formattedPrice}</p>`;
        }


        // 외부 지도 연결 버튼
        detailsHtml += `
            <div class="map-links">
                <h4><i class="fas fa-external-link-alt"></i> 외부 지도에서 보기</h4>
                <div class="map-buttons">
                    <button class="map-btn google-btn" onclick="openGoogleMaps('${place.address}', ${place.latitude}, ${place.longitude})">
                        <i class="fab fa-google"></i> 구글지도
                    </button>
                    <button class="map-btn amap-btn" onclick="openAmapSearch('${place.address}', ${place.latitude}, ${place.longitude})">
                        <i class="fas fa-map"></i> 가오더지도
                    </button>
                </div>
            </div>
        `;
    } else {
        // 여러 장소가 그룹화된 경우
        detailsHtml = `
            <div class="group-header">
                <h3>
                    <i class="fas fa-map-marker-alt"></i>
                    이 위치의 장소들
                    <span class="place-count-badge">${group.places.length}곳</span>
                </h3>
            </div>
        `;

        group.places.forEach((place, index) => {
            detailsHtml += `
                <div class="place-group-item type-${place.type}">
                    <div class="place-type-badge type-${place.type}">
                        ${getTypeIcon(place.type, place)} ${getTypeDisplayName(place.type)}
                    </div>
                    <h4>${place.name}</h4>
            `;

            if (place.description) {
                detailsHtml += `<p><strong>설명:</strong> ${place.description}</p>`;
            }

            if (place.address && place.address !== "N/A") {
                detailsHtml += `<p><strong>주소:</strong> ${place.address}</p>`;
            }

            if (place.features && place.features.length > 0) {
                detailsHtml += `<p><strong>특징:</strong> ${place.features.join(', ')}</p>`;
            }

            if (place.menu && place.menu.length > 0) {
                detailsHtml += `<p><strong>메뉴:</strong> ${place.menu.join(', ')}</p>`;
            }
            // 호텔 가격 정보 표시 (그룹 내 각 장소)
            if (place.type === 'hotels' && place.price) {
                const formattedPrice = `₩${parseInt(place.price).toLocaleString('ko-KR')}`;
                detailsHtml += `<p><strong>가격:</strong> ${formattedPrice}</p>`;
            }

            // 개별 지도 연결 버튼
            detailsHtml += `
                <div class="place-map-buttons">
                    <button class="map-btn-small google-btn" onclick="openGoogleMaps('${place.address}', ${place.latitude}, ${place.longitude})" title="구글지도에서 ${place.name} 검색">
                        <i class="fab fa-google"></i>
                    </button>
                    <button class="map-btn-small amap-btn" onclick="openAmapSearch('${place.address}', ${place.latitude}, ${place.longitude})" title="가오더지도에서 ${place.name} 검색">
                        <i class="fas fa-map"></i>
                    </button>
                </div>
            `;

            detailsHtml += `</div>`;

            // 마지막 요소가 아니면 구분선 추가
            if (index < group.places.length - 1) {
                detailsHtml += `<div class="place-separator"></div>`;
            }
        });

        // 그룹 전체 지도 연결 버튼
        const firstPlace = group.places[0]; // 그룹의 첫 번째 장소 정보 사용
        detailsHtml += `
            <div class="group-map-links">
                <h4><i class="fas fa-external-link-alt"></i> 이 위치 전체보기</h4>
                <div class="map-buttons">
                    <button class="map-btn google-btn" onclick="openGoogleMaps('${firstPlace.address}', ${group.latitude}, ${group.longitude})">
                        <i class="fab fa-google"></i> 구글지도
                    </button>
                    <button class="map-btn amap-btn" onclick="openAmapSearch('${firstPlace.address}', ${group.latitude}, ${group.longitude})">
                        <i class="fas fa-map"></i> 가오더지도
                    </button>
                </div>
            </div>
        `;
    }

    placeContent.innerHTML = detailsHtml; // 생성된 HTML을 정보 박스에 삽입
    infoBox.classList.add('show'); // 정보 박스를 보이도록
}

// 구글지도 열기 함수 (주소와 좌표를 함께 사용하여 정확도 높임)
function openGoogleMaps(address, lat, lng) {
    const encodedAddress = encodeURIComponent(address);
    // Google Maps URL을 수정했습니다. (https://www.google.com/maps/search/?api=1&query=$ 이 부분은 일반적으로 사용되지 않습니다.)
    // https://www.google.com/maps/search/ 또는 https://www.google.com/maps/dir/ 형식이 일반적입니다.
    // 여기서는 좌표를 중심으로 표시하고, 주소를 검색어로 사용하도록 구성했습니다.
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodedAddress}`;
    window.open(googleMapsUrl, '_blank');
}

// 가오더지도 열기 함수 (주소와 좌표를 함께 사용하여 정확도 높임)
function openAmapSearch(address, lat, lng) {
    const encodedAddress = encodeURIComponent(address);
    // Gaode Maps (Amap) URL은 쿼리 파라미터가 다를 수 있습니다.
    // 좌표를 직접 넘겨주는 것이 더 정확할 수 있습니다.
    // 이 예시에서는 기존 방식을 유지하지만, API 문서 확인이 필요할 수 있습니다.
    const amapUrl = `https://ditu.amap.com/search?query=${encodedAddress}&city=上海&geoobj=${lng}|${lat}|${lng}|${lat}&zoom=17`;
    window.open(amapUrl, '_blank');
}

// 정보 박스 닫기 함수
function closeInfoBox() {
    const infoBox = document.getElementById('place-details');
    infoBox.classList.remove('show'); // 정보 박스를 숨기도록
}

// 타입별 아이콘 반환 함수 (UI에 사용)
function getTypeIcon(type, place = null) {
    switch (type) {
        case 'attractions': 
            return '📷';
        case 'restaurants': 
            // 식당의 경우 메뉴에 따라 다른 아이콘 표시
            if (place) {
                const category = getRestaurantCategory(place);
                switch (category) {
                    case 'dumpling': return '🥟'; // 만두/딤섬
                    case 'noodle': return '🍜';   // 면 요리
                    case 'seafood': return '🐟';  // 해산물
                    case 'hotpot': return '🍲';   // 훠궈/탕류
                    case 'chinese': return '🍗';  // 고급 중식/고기요리
                    case 'taiwanese': return '🌿'; // 대만 요리
                    default: return '🍴';         // 기본 식당
                }
            }
            return '🍴';
        case 'airports': 
            return '✈️';
        case 'hotels': 
            return '🏨';
        default: 
            return '📍';
    }
}

// 타입별 한국어 이름 반환 함수 (UI에 사용)
function getTypeDisplayName(type) {
    switch (type) {
        case 'attractions': return '관광지';
        case 'restaurants': return '음식점';
        case 'airports': return '공항';
        case 'hotels': return '호텔';
        default: return '기타';
    }
}
