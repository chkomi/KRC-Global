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
    attractions: '#34a853',  // 관광지 (Google Green)
    restaurants: '#ea4335',  // 식당 (Google Red)
    airports: '#fbbc05',     // 공항 (Google Yellow)
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
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri'
    }),
    terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap'
    })
};

let currentTileLayerType = 'terrain';

// 문서 로드 완료 시 초기화 - 더 안전한 방법
document.addEventListener('DOMContentLoaded', () => {
    console.log('페이지 로드 완료, 지도 초기화 시작');
    initMap();
});

// 지도 초기화 함수
async function initMap() {
    try {
        console.log('지도 초기화 시작');
        
        // 데이터 로드
        const response = await fetch('/KRC-Global/data/shanghai-data.json');
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
        
        // 기본 타일 레이어 설정 (테스트 버전은 도로 지도)
        tileLayers.terrain.addTo(map);
        currentTileLayerType = 'terrain';

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

        // 마커 그룹들을 지도에 추가
        Object.values(markerGroups).forEach(group => {
            group.addTo(map);
        });

        displayMarkers();
        
        // 범례 체크박스 기능 초기화
        setupLegendControls();
    } catch (error) {
        console.error('데이터 로드 중 오류:', error);
        alert('데이터를 불러오는 중 오류가 발생했습니다.');
    }
}

// 마커 표시 함수
function displayMarkers() {
    if (!map || !shanghaiData) {
        console.error('지도 또는 데이터가 초기화되지 않았습니다.');
        return;
    }

    console.log('마커 표시 시작');

    // 기존 마커와 라벨 제거
    markers.forEach(marker => {
        if (marker && marker.remove) {
            marker.remove();
        }
    });
    markers = [];
    allMarkers = [];

    // 모든 장소 데이터를 하나의 배열로 합치기
    const allPlaces = [];
    const types = ['attractions', 'restaurants', 'hotels', 'airports'];

    types.forEach(type => {
        const places = shanghaiData[type];
        if (Array.isArray(places)) {
            places.forEach(place => {
                if (place.latitude && place.longitude) {
                    allPlaces.push({...place, type: type});
                }
            });
        }
    });

    console.log('처리할 장소 수:', allPlaces.length);

    // 장소 그룹화
    const groups = {};
    allPlaces.forEach(place => {
        const key = `${place.latitude},${place.longitude}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(place);
    });

    console.log('그룹화된 장소 수:', Object.keys(groups).length);

    // 각 그룹에 대해 마커 생성
    Object.values(groups).forEach(group => {
        if (group.length === 0) return;

        // 그룹의 우선순위가 가장 높은 타입 결정
        const highestPriorityType = group.reduce((highest, place) => {
            const currentPriority = typePriorities[place.type] || 0;
            return currentPriority > (typePriorities[highest?.type] || 0) ? place : highest;
        }, group[0]);

        // 마커 생성
        const marker = L.marker([highestPriorityType.latitude, highestPriorityType.longitude], {
            icon: createCustomIcon(highestPriorityType.type)
        });

        // 라벨 텍스트 설정
        let labelText = extractKorean(highestPriorityType.name);
        if (highestPriorityType.type === 'hotels' && highestPriorityType.price) {
            const price = parseInt(highestPriorityType.price);
            const formattedPrice = `₩${price.toLocaleString('ko-KR')}`;
            labelText += `<br><span class="price-label">${formattedPrice}</span>`;
        }
        if (group.length > 1) {
            labelText += ` (${group.length})`;
        }

        // 툴팁 생성 및 설정
        const tooltip = L.tooltip({
            permanent: true,
            direction: 'top',
            offset: [0, -5],
            opacity: 1,
            className: `place-label type-${highestPriorityType.type}`
        }).setContent(labelText);

        // 팝업 생성 및 설정
        const popup = L.popup({
            maxWidth: 300,
            className: `custom-popup type-${highestPriorityType.type}`
        });

        // 그룹에 장소가 하나인 경우
        if (group.length === 1) {
            popup.setContent(createPopupContent(highestPriorityType));
        } else {
            // 여러 장소가 있는 경우 그룹 팝업 생성
            const groupContent = document.createElement('div');
            groupContent.className = 'popup-content';
            
            const header = document.createElement('div');
            header.className = `popup-header type-${highestPriorityType.type}`;
            header.innerHTML = `<h3>${group.length}개의 장소</h3>`;
            groupContent.appendChild(header);
            
            const placesList = document.createElement('div');
            placesList.className = 'places-list';
            
            group.forEach(place => {
                const placeItem = document.createElement('div');
                placeItem.className = 'place-item';
                placeItem.innerHTML = `
                    <h4>${extractKorean(place.name)}</h4>
                    ${place.address ? `<p><strong>주소:</strong> ${place.address}</p>` : ''}
                    ${place.type === 'hotels' && place.price ? 
                        `<p><strong>가격:</strong> ₩${parseInt(place.price).toLocaleString('ko-KR')}</p>` : ''}
                `;
                placesList.appendChild(placeItem);
            });
            
            groupContent.appendChild(placesList);
            popup.setContent(groupContent);
        }

        marker.bindPopup(popup);
        marker.addTo(markerGroups[highestPriorityType.type]);
        markers.push(marker);

        // 마커 정보 저장
        allMarkers.push({
            marker: marker,
            tooltip: tooltip,
            groupType: highestPriorityType.type,
            visible: false
        });
    });

    console.log('생성된 마커 수:', markers.length);

    // 라벨 가시성 업데이트
    setTimeout(() => {
        updateLabelVisibility();
    }, 100);
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

// 텍스트에서 한글 부분만 추출하는 함수 (라벨 표시용)
function extractKorean(text) {
    const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]+/g;
    const matches = text.match(koreanRegex);
    return matches ? matches.join(' ') : text;
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
    const content = document.createElement('div');
    content.className = 'custom-popup';
    
    // 팝업 헤더
    const header = document.createElement('div');
    header.className = 'popup-header';
    header.innerHTML = `
        <h3>${place.name}</h3>
        <span class="place-type-badge type-${place.type}">${getTypeLabel(place.type)}</span>
    `;
    content.appendChild(header);

    // 팝업 본문
    const body = document.createElement('div');
    body.className = 'popup-body';
    
    // 기본 정보
    const info = document.createElement('div');
    info.className = 'popup-info';
    
    let infoHTML = '';
    
    // 주소 정보
    if (place.address) {
        infoHTML += `<p><i class="fas fa-map-marker-alt"></i> ${place.address}</p>`;
    }
    
    // 설명 정보
    if (place.description) {
        infoHTML += `<p><i class="fas fa-info-circle"></i> ${place.description}</p>`;
    }
    
    // 가격 정보 (숙소인 경우)
    if (place.price) {
        infoHTML += `<p class="price-info"><i class="fas fa-yen-sign"></i> ${place.price}</p>`;
    }
    
    // 특징 정보
    if (place.features && place.features.length > 0) {
        infoHTML += `<p><i class="fas fa-star"></i> ${place.features.join(', ')}</p>`;
    }
    
    // 메뉴 정보 (맛집인 경우)
    if (place.type === 'restaurants' && place.menu && place.menu.length > 0) {
        infoHTML += `<p><i class="fas fa-utensils"></i> 대표 메뉴: ${place.menu.slice(0, 3).join(', ')}${place.menu.length > 3 ? '...' : ''}</p>`;
    }
    
    info.innerHTML = infoHTML;
    body.appendChild(info);

    // 지도 링크 버튼
    const mapLinks = document.createElement('div');
    mapLinks.className = 'map-links';
    
    // 이름에서 한국어명과 중국어명 추출
    const nameParts = place.name.split('(');
    const koreanName = nameParts[0].trim();
    const chineseName = nameParts[1]?.split(')')[0]?.trim() || '';
    
    // 모바일 감지
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    let googleUrl, amapUrl;
    
    if (isMobile) {
        // 모바일: 앱으로 연결
        googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(koreanName)}&z=15`;
        // 고덕지도 앱 연결 - 여러 스키마 시도
        amapUrl = `https://uri.amap.com/marker?position=${place.lng},${place.lat}&name=${encodeURIComponent(chineseName)}&src=web`;
    } else {
        // 데스크톱: 웹으로 연결
        googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(koreanName)}`;
        amapUrl = `https://uri.amap.com/marker?position=${place.lng},${place.lat}&name=${encodeURIComponent(chineseName)}`;
    }
    
    mapLinks.innerHTML = `
        <h4><i class="fas fa-map"></i> 지도에서 보기</h4>
        <div class="map-buttons">
            <a href="${googleUrl}" 
               target="_blank" class="map-btn google-btn">
                <i class="fab fa-google"></i> Google Maps
            </a>
            <a href="${amapUrl}" 
               target="_blank" class="map-btn amap-btn">
                <i class="fas fa-map-marked-alt"></i> 高德地图
            </a>
        </div>
    `;
    body.appendChild(mapLinks);

    content.appendChild(body);
    return content;
}

// 이벤트 리스너 설정 함수
function setupEventListeners() {
    // ESC 키로 열려있는 Leaflet 팝업 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            map.closePopup();
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
        markerGroups[type].addTo(map); // 그룹 보이기
    } else {
        map.removeLayer(markerGroups[type]); // 그룹 숨기기
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
    const minZoomForLabels = 14;
    const bounds = map.getBounds();
    
    allMarkers.forEach(markerData => {
        const isGroupVisible = map.hasLayer(markerGroups[markerData.groupType]);
        const isInBounds = bounds.contains(markerData.marker.getLatLng());
        
        if (currentZoom >= minZoomForLabels && isGroupVisible && isInBounds) {
            if (!markerData.visible) {
                markerData.marker.bindTooltip(markerData.tooltip);
                markerData.visible = true;
            }
        } else {
            if (markerData.visible) {
                markerData.marker.unbindTooltip();
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
    if (tileLayers[type] && currentTileLayerType !== type) {
        map.removeLayer(tileLayers[currentTileLayerType]);
        tileLayers[type].addTo(map);
        currentTileLayerType = type;
        
        // 활성화된 타일 옵션 스타일 업데이트
        updateTileOptionStyles(type);
    }
}

// 타일 옵션 스타일 업데이트
function updateTileOptionStyles(activeType) {
    const tileOptions = document.querySelectorAll('.tile-option');
    tileOptions.forEach(option => {
        option.classList.remove('active');
        if (option.getAttribute('onclick').includes(activeType)) {
            option.classList.add('active');
        }
    });
}

// 범례 체크박스 기능
function setupLegendControls() {
    const legendItems = document.querySelectorAll('.legend-item');
    legendItems.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const type = checkbox.getAttribute('data-type');
        
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                showMarkerGroup(type);
            } else {
                hideMarkerGroup(type);
            }
        });
    });
}

// 마커 그룹 표시/숨김 함수
function showMarkerGroup(type) {
    if (markerGroups[type]) {
        map.addLayer(markerGroups[type]);
    }
}

function hideMarkerGroup(type) {
    if (markerGroups[type]) {
        map.removeLayer(markerGroups[type]);
    }
}