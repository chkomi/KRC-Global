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
    attractions: '#ea4335',  // 관광지 (Google Red)
    restaurants: '#34a853',  // 식당 (Google Green)
    airports: '#9b59b6',     // 공항 (Purple)
    hotels: '#1a73e8'        // 호텔 (Google Blue)
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

// 클러스터 그룹들
let clusterGroups = {
    attractions: L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 40,
        disableClusteringAtZoom: 16,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            const type = cluster.getAllChildMarkers()[0].options.type;
            const color = markerColors[type];
            return L.divIcon({
                html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: L.point(30, 30),
                iconAnchor: L.point(15, 15)
            });
        }
    }),
    restaurants: L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 50,
        disableClusteringAtZoom: 16,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            const type = cluster.getAllChildMarkers()[0].options.type;
            const color = markerColors[type];
            return L.divIcon({
                html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: L.point(30, 30),
                iconAnchor: L.point(15, 15)
            });
        }
    }),
    hotels: L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 60,
        disableClusteringAtZoom: 16,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            const type = cluster.getAllChildMarkers()[0].options.type;
            const color = markerColors[type];
            return L.divIcon({
                html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: L.point(30, 30),
                iconAnchor: L.point(15, 15)
            });
        }
    }),
    airports: L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 70,
        disableClusteringAtZoom: 16,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            const type = cluster.getAllChildMarkers()[0].options.type;
            const color = markerColors[type];
            return L.divIcon({
                html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: L.point(30, 30),
                iconAnchor: L.point(15, 15)
            });
        }
    })
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
        console.log('데이터 로드 완료:', shanghaiData);
        
        // 지도 생성 (초기 줌 레벨 9로 설정)
        map = L.map('map').setView([31.2304, 121.4737], 9);
        
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

        // 클러스터 그룹들을 지도에 추가
        Object.values(clusterGroups).forEach(group => {
            group.addTo(map);
            
            // 클러스터 이벤트 리스너 추가
            group.on('animationend', updateLabelVisibility);
            group.on('spiderfied', updateLabelVisibility);
            group.on('unspiderfied', updateLabelVisibility);
            group.on('clusterclick', updateLabelVisibility);
            group.on('clustermouseover', updateLabelVisibility);
            group.on('clustermouseout', updateLabelVisibility);
        });

        displayMarkers();
        
        // 이벤트 리스너 연결
        setupEventListeners();
        // 일정 패널 초기화
        initializeItineraryPanel();
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
        attractions: '#ea4335',
        restaurants: '#34a853',
        hotels: '#1a73e8',
        airports: '#9b59b6'
    };

    ['attractions', 'restaurants', 'hotels', 'airports'].forEach(type => {
        (shanghaiData[type] || []).forEach(place => {
            const marker = L.marker([place.latitude, place.longitude], {
                icon: createCustomIcon(type),
                name: place.name,
                type: type,
                place: place
            });
            marker.bindPopup(createPopupContent(place));
            // 마커 라벨 생성 및 동적 표시 (hover 효과 없이)
            marker.on('add', function() {
                const markerElem = marker._icon;
                if (markerElem && !markerElem.querySelector('.marker-label')) {
                    // 괄호 내 첫 단어 추출
                    let labelText = '';
                    const match = place.name.match(/\(([^,\s)]+)/);
                    if (match && match[1]) {
                        labelText = match[1];
                    }
                    if (!labelText) labelText = place.name.split('/')[0].trim();
                    const label = document.createElement('div');
                    label.className = 'marker-label';
                    label.innerText = labelText;
                    label.style.background = typeColors[type];
                    markerElem.appendChild(label);
                }
                // hover 효과 제거
                markerElem.style.filter = 'none';
                markerElem.style.boxShadow = 'none';
                markerElem.style.outline = 'none';
            });
            // 마우스오버/아웃/클릭 시 불필요한 효과 제거
            marker.off('mouseover');
            marker.off('mouseout');
            // 클러스터 그룹에 추가
            clusterGroups[type].addLayer(marker);
            allMarkers.push({ marker, place: { ...place, type } });
        });
    });
    Object.values(clusterGroups).forEach(group => map.addLayer(group));
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
    const match = text.match(/\(([^)]+)\)/);
    return match ? match[1] : text;
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

// 팝업 내용 생성 함수
function createPopupContent(place) {
    const koreanName = extractKorean(place.name);
    const typeLabel = getTypeLabel(place.type || 'attractions');
    
    let html = `<div class='popup-header'>
        <h3><i class="fas fa-map-marker-alt"></i> ${koreanName}</h3>
        <span class="place-type-badge">${typeLabel}</span>
    </div>`;
    
    html += `<div class='popup-body'>`;
    html += `<div class='popup-info'>`;
    
    if (place.address && place.address !== "N/A") {
        html += `<p><i class='fas fa-map-marker-alt'></i> ${place.address}</p>`;
    }
    
    if (place.description) {
        html += `<p><i class='fas fa-info-circle'></i> ${compressDescription(place.description)}</p>`;
    }
    
    if (place.features && place.features.length > 0) {
        html += `<p><i class='fas fa-star'></i> ${place.features.join(', ')}</p>`;
    }
    
    if (place.price) {
        const priceInWon = Math.round(parseInt(place.price) * 0.18);
        html += `<div class='price-info'>
            <i class='fas fa-coins'></i> 
            <strong>가격:</strong> ${priceInWon.toLocaleString()}원 (약 ${parseInt(place.price).toLocaleString()}엔)
        </div>`;
    }
    
    html += `</div>`;
    html += `<div class='map-links'>
        <h4><i class='fas fa-map'></i> 지도에서 보기</h4>
        <div class='map-buttons'>
            <a class='map-btn google-btn' href='javascript:void(0)' onclick='openGoogleMaps("${place.name}", ${place.latitude}, ${place.longitude})'>
                <i class='fab fa-google'></i>구글지도
            </a>
            <a class='map-btn amap-btn' href='javascript:void(0)' onclick='openAmapSearch("${place.name}", ${place.latitude}, ${place.longitude})'>
                <i class='fas fa-map-marked-alt'></i>가오더지도
            </a>
        </div>
    </div>`;
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
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();
    
    allMarkers.forEach(markerData => {
        const marker = markerData.marker;
        const isInBounds = bounds.contains(marker.getLatLng());
        
        // 클러스터 상태 확인
        const isClustered = marker._icon && marker._icon.parentNode && 
                           marker._icon.parentNode.classList.contains('marker-cluster');
        
        // 클러스터링되지 않은 마커는 줌 레벨에 상관없이 라벨 표시
        if (!isClustered && isInBounds) {
            if (!markerData.visible) {
                marker.bindTooltip(markerData.tooltip);
                markerData.visible = true;
            }
        } else {
            if (markerData.visible) {
                marker.unbindTooltip();
                markerData.visible = false;
            }
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
    const content = document.getElementById('itinerary-content');
    
    if (dayKey === 'all') {
        // 전체 일정 표시
        let allItineraryHTML = '<div class="all-itinerary">';
        
        // 전체 합산 비용 계산
        let totalTransportCost = 0;
        let totalMealCost = 0;
        let totalActivityCost = 0;
        
        for (let i = 1; i <= 4; i++) {
            const dayKey = `day${i}`;
            const daySchedule = shanghaiData.itinerary[dayKey];
            if (daySchedule) {
                const dayCosts = calculateDayCosts(daySchedule);
                totalTransportCost += dayCosts.transport;
                totalMealCost += dayCosts.meal;
                totalActivityCost += dayCosts.activity;
            }
        }
        
        const totalCost = totalTransportCost + totalMealCost + totalActivityCost;
        
        // 전체 합산 비용을 맨 위에 표시
        allItineraryHTML += `
            <div class="day-cost-summary total-cost-summary">
                <h4><i class="fas fa-calculator"></i> 전체 여행 비용 합계</h4>
                <div class="cost-breakdown">
                    <div class="cost-item">
                        <div class="cost-item-label">🚇 교통</div>
                        <div class="cost-item-value">¥${totalTransportCost}</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-item-label">🍽️ 식사</div>
                        <div class="cost-item-value">¥${totalMealCost}</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-item-label">🎯 관광</div>
                        <div class="cost-item-value">¥${totalActivityCost}</div>
                    </div>
                </div>
                <div class="cost-total">
                    총합: ¥${totalCost}
                </div>
            </div>
        `;
        
        for (let i = 1; i <= 4; i++) {
            const dayKey = `day${i}`;
            const daySchedule = shanghaiData.itinerary[dayKey];
            if (!daySchedule) continue;
            
            const dayTitle = i === 1 ? '11.12 (1일차)' : 
                           i === 2 ? '11.13 (2일차)' : 
                           i === 3 ? '11.14 (3일차)' : '11.15 (4일차)';
            
            // 각 일자별 비용 계산
            const dayCosts = calculateDayCosts(daySchedule);
            
            allItineraryHTML += `
                <div class="day-schedule all-day-schedule">
                    <h4><i class="fas fa-calendar-day"></i> ${dayTitle}</h4>
                    
                    <!-- 일자별 비용 요약 -->
                    <div class="day-cost-summary">
                        <div class="cost-breakdown">
                            <div class="cost-item">
                                <div class="cost-item-label">🚇 교통</div>
                                <div class="cost-item-value">¥${dayCosts.transport}</div>
                            </div>
                            <div class="cost-item">
                                <div class="cost-item-label">🍽️ 식사</div>
                                <div class="cost-item-value">¥${dayCosts.meal}</div>
                            </div>
                            <div class="cost-item">
                                <div class="cost-item-label">🎯 관광</div>
                                <div class="cost-item-value">¥${dayCosts.activity}</div>
                            </div>
                        </div>
                        <div class="cost-total">
                            총합: ¥${dayCosts.total}
                        </div>
                    </div>
                    
                    <div class="schedule-grid">
            `;
            
            // 일정 항목들을 시간순으로 정렬
            const scheduleItems = Object.entries(daySchedule).sort((a, b) => {
                const timeA = a[1].time || '00:00';
                const timeB = b[1].time || '00:00';
                return timeA.localeCompare(timeB);
            });
            
            scheduleItems.forEach(([key, schedule]) => {
                const icon = getScheduleIcon(key);
                const itemClass = getScheduleItemClass(key);
                const locationName = extractKorean(schedule.location);
                const distance = schedule.distance || '-';
                const transportCost = schedule.cost?.transport || '';
                const activityCost = schedule.cost?.activity || '';
                const compressedDesc = compressDescription(schedule.description);
                
                allItineraryHTML += `
                    <div class="schedule-item all-schedule-item ${itemClass}">
                        <div class="schedule-time">
                            <i class="${icon}"></i>
                            <span>${schedule.time}</span>
                        </div>
                        <div class="schedule-content">
                            <div class="schedule-location">${locationName}</div>
                            <div class="schedule-desc">${compressedDesc}</div>
                        </div>
                        <div class="schedule-distance">
                            <div class="distance-value">${distance}</div>
                        </div>
                        <div class="schedule-cost">
                            ${transportCost ? `<div class="transport-cost">${transportCost}</div>` : ''}
                            ${activityCost ? `<div class="activity-cost">${activityCost}</div>` : ''}
                        </div>
                    </div>
                `;
            });
            
            allItineraryHTML += `
                    </div>
                </div>
            `;
        }
        
        allItineraryHTML += '</div>';
        content.innerHTML = allItineraryHTML;
    } else {
        // 개별 일정 표시 (기존 로직)
        const daySchedule = shanghaiData.itinerary[dayKey];
        if (!daySchedule) {
            content.innerHTML = '<p>일정 정보를 찾을 수 없습니다.</p>';
            return;
        }
        
        let itineraryHTML = '<div class="day-schedule">';
        
        // 일정 항목들을 시간순으로 정렬
        const scheduleItems = Object.entries(daySchedule).sort((a, b) => {
            const timeA = a[1].time || '00:00';
            const timeB = b[1].time || '00:00';
            return timeA.localeCompare(timeB);
        });
        
        scheduleItems.forEach(([key, schedule]) => {
            itineraryHTML += createItineraryItem(key, schedule);
        });
        
        itineraryHTML += '</div>';
        content.innerHTML = itineraryHTML;
    }
    
    addItineraryClickListeners();
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
            targetMarker = marker;
        }
    });
    
    if (targetMarker) {
        const latlng = targetMarker.getLatLng();
        map.setView(latlng, 16, {
            animate: true,
            duration: 1
        });
        
        // 마커에 임시 하이라이트 효과
        targetMarker.setZIndexOffset(1000);
        setTimeout(() => {
            targetMarker.setZIndexOffset(0);
        }, 2000);
        
        console.log('줌 이동:', location);
        
        // 팝업 닫기
        document.getElementById('itinerary-popup').classList.remove('show');
        
        // 마커가 속한 클러스터 그룹을 열어서 마커를 보여줌
        Object.values(clusterGroups).forEach(group => {
            if (group.hasLayer(targetMarker)) {
                group.zoomToShowLayer(targetMarker, () => {
                    targetMarker.openPopup();
                });
            }
        });
    } else {
        console.log('마커를 찾을 수 없음:', location);
    }
}

function filterMarkersByDay(selectedDay) {
    if (!map || !allMarkers.length) return;

    console.log('필터링 시작:', selectedDay);

    // 모든 클러스터 그룹에서 레이어를 지웁니다.
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
        const marker = markerInfo.marker;
        
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
            if (clusterGroups[place.type]) {
                clusterGroups[place.type].addLayer(marker);
                visibleCount++;
                console.log('마커 표시:', place.name, '(타입:', place.type, ')');
            } else {
                console.warn('알 수 없는 타입:', place.type, '장소:', place.name);
            }
        }
    });

    console.log('표시된 마커 수:', visibleCount);
    updateLabelVisibility();
}

function showDayBottomSheet(dayKey) {
    const bottomSheet = document.getElementById('bottom-sheet');
    const bottomSheetItems = document.getElementById('bottom-sheet-items');
    const closeButton = document.getElementById('close-bottom-sheet');
    
    if (!bottomSheet || !bottomSheetItems) return;
    
    const daySchedule = shanghaiData.itinerary[dayKey];
    if (!daySchedule) return;
    
    const dayTitle = dayKey === 'day1' ? '11.12 (1일차)' : 
                    dayKey === 'day2' ? '11.13 (2일차)' : 
                    dayKey === 'day3' ? '11.14 (3일차)' : '11.15 (4일차)';
    
    // 제목 업데이트
    const titleElement = bottomSheet.querySelector('.bottom-sheet-title');
    if (titleElement) {
        titleElement.textContent = dayTitle;
    }
    
    // 총 비용 계산
    const dayCosts = calculateDayCosts(daySchedule);
    
    // 비용 요약을 상단에 표시
    let dayItineraryHTML = `
        <div class="day-cost-summary">
            <h4><i class="fas fa-calculator"></i> ${dayTitle} 비용</h4>
            <div class="cost-breakdown">
                <div class="cost-item">
                    <div class="cost-item-label">🚇 교통</div>
                    <div class="cost-item-value">¥${dayCosts.transport}</div>
                </div>
                <div class="cost-item">
                    <div class="cost-item-label">🍽️ 식사</div>
                    <div class="cost-item-value">¥${dayCosts.meal}</div>
                </div>
                <div class="cost-item">
                    <div class="cost-item-label">🎯 관광</div>
                    <div class="cost-item-value">¥${dayCosts.activity}</div>
                </div>
            </div>
            <div class="cost-total">
                총합: ¥${dayCosts.total}
            </div>
        </div>
    `;
    
    // 일정 항목들을 시간순으로 정렬
    const scheduleItems = Object.entries(daySchedule).sort((a, b) => {
        const timeA = a[1].time || '00:00';
        const timeB = b[1].time || '00:00';
        return timeA.localeCompare(timeB);
    });

    scheduleItems.forEach(([key, schedule]) => {
        const icon = getScheduleIcon(key);
        const itemClass = getScheduleItemClass(key);
        const locationName = extractKorean(schedule.location);
        const distance = schedule.distance || '-';
        const transportCost = schedule.cost?.transport || '';
        const activityCost = schedule.cost?.activity || '';
        const compressedDesc = compressDescription(schedule.description);
        
        dayItineraryHTML += `
            <div class="schedule-item bottom-sheet-item ${itemClass}">
                <div class="bottom-sheet-time">
                    <i class="${icon}"></i>
                    <span>${schedule.time}</span>
                </div>
                <div class="bottom-sheet-content">
                    <div class="bottom-sheet-location">${locationName}</div>
                    <div class="bottom-sheet-desc">${compressedDesc}</div>
                </div>
                <div class="bottom-sheet-distance">
                    <div class="distance-value">${distance}</div>
                </div>
                <div class="bottom-sheet-cost">
                    ${transportCost ? `<div class="transport-cost">${transportCost}</div>` : ''}
                    ${activityCost ? `<div class="activity-cost">${activityCost}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    bottomSheetItems.innerHTML = dayItineraryHTML;
    bottomSheet.classList.add('show');
    
    // 닫기 버튼 이벤트
    if (closeButton) {
        closeButton.onclick = () => {
            bottomSheet.classList.remove('show', 'expanded');
        };
    }
    
    // 지도 클릭 시 닫기
    if (map) {
        map.once('click', () => {
            bottomSheet.classList.remove('show', 'expanded');
        });
    }
    
    // 드래그 기능 추가
    setupDragToExpand(bottomSheet);
    
    // 일정 항목 클릭 이벤트
    const items = bottomSheetItems.querySelectorAll('.bottom-sheet-item');
    items.forEach(item => {
        item.addEventListener('click', () => {
            const location = item.getAttribute('data-location');
            zoomToLocation(location);
        });
    });
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
    fetch('data/shanghai-data.json')
        .then(response => response.json())
        .then(data => {
            window.itineraryData = data.shanghai_tourism.itinerary;
            showDayBottomSheet('all');
            setupMapClickToClosePopup();
        });
});