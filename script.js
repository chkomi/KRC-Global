// Global Variables
let map;
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
    attractions: '#ea4335', // 관광지 (Google Red)
    restaurants: '#34a853', // 음식점 (Google Green)
    airports: '#9b59b6',    // 공항 (Purple)
    hotels: '#1a73e8'      // 호텔 (Google Blue)
};

// 문서 로드 완료 시 초기화 - 더 안전한 방법
document.addEventListener('DOMContentLoaded', () => {
    console.log('페이지 로드 완료, 지도 초기화 시작');
    initMap();
});

// 지도 초기화 함수
function initMap() {
    console.log('지도 초기화 시작');
    
    // 지도 생성
    map = L.map('map').setView([31.2304, 121.4737], 13);
    
    // 타일 레이어 추가
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 데이터 로드
    fetch('shanghai_tourism.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('데이터 로드 실패');
            }
            return response.json();
        })
        .then(data => {
            console.log('데이터 로드 성공:', data);
            shanghaiData = data;
            displayMarkers();
        })
        .catch(error => {
            console.error('데이터 로드 중 오류:', error);
            alert('데이터를 불러오는 중 오류가 발생했습니다.');
        });

    // 줌 변경 이벤트 리스너
    map.on('zoomend', () => {
        updateLabelVisibility();
    });

    // 지도 이동 이벤트 리스너
    map.on('moveend', () => {
        updateLabelVisibility();
    });
}

// 마커 표시 함수
function displayMarkers() {
    console.log('displayMarkers 함수 시작');
    
    if (!map) {
        console.error('지도 객체가 없습니다.');
        return;
    }
    
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('마커를 표시할 데이터가 없습니다.');
        return;
    }

    // 기존 마커와 라벨 제거
    markers.forEach(marker => marker.remove());
    markers = [];
    
    // 모든 장소 데이터를 하나의 배열로 합치기
    const allPlaces = [];
    const types = ['attractions', 'restaurants', 'hotels', 'airports'];

    types.forEach(type => {
        const places = shanghaiData.shanghai_tourism[type];
        if (Array.isArray(places)) {
            places.forEach(place => {
                allPlaces.push({...place, type: type});
            });
        } else {
            console.warn(`데이터에 "${type}" 카테고리가 유효한 배열이 아닙니다.`);
        }
    });

    if (allPlaces.length === 0) {
        console.warn('로드된 데이터에서 유효한 장소를 찾을 수 없습니다.');
        return;
    }

    // 위치(좌표)별로 장소들을 그룹화
    const locationGroups = {};
    allPlaces.forEach(place => {
        const lat = parseFloat(place.latitude);
        const lng = parseFloat(place.longitude);

        if (isNaN(lat) || isNaN(lng)) {
            console.warn(`유효하지 않은 좌표 발견: ${place.name}`);
            return;
        }

        const locationKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;

        if (!locationGroups[locationKey]) {
            locationGroups[locationKey] = {
                latitude: lat,
                longitude: lng,
                places: []
            };
        }
        locationGroups[locationKey].places.push(place);
    });

    // 각 위치 그룹에 대해 마커 생성
    Object.values(locationGroups).forEach((group, groupIndex) => {
        try {
            // 그룹의 가장 높은 우선순위 타입 결정
            const highestPriorityType = group.places.reduce((highest, place) => {
                const currentPriority = getTypePriority(place.type);
                return currentPriority > highest.priority ? 
                    { type: place.type, priority: currentPriority } : highest;
            }, { type: group.places[0].type, priority: getTypePriority(group.places[0].type) }).type;

            // 마커 아이콘 생성
            const markerIcon = L.divIcon({
                className: `custom-marker type-${highestPriorityType}`,
                html: `<div class="marker-icon type-${highestPriorityType}"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            // 마커 생성
            const marker = L.marker([group.latitude, group.longitude], { icon: markerIcon });
            
            // 라벨 텍스트 설정
            let labelText = extractKorean(group.places[0].name);
            if (highestPriorityType === 'hotels' && group.places[0].price) {
                const price = parseInt(group.places[0].price);
                const formattedPrice = `₩${price.toLocaleString('ko-KR')}`;
                labelText += `<br><span class="price-label">${formattedPrice}</span>`;
            }
            
            if (group.places.length > 1) {
                labelText += ` (${group.places.length})`;
            }

            // 툴팁 생성
            const tooltip = L.tooltip({
                permanent: true,
                direction: 'top',
                className: `place-label type-${highestPriorityType}`,
                offset: [0, -5],
                opacity: 1
            }).setContent(labelText);

            // 마커에 툴팁 추가
            marker.bindTooltip(tooltip);
            
            // 마커 클릭 이벤트
            marker.on('click', () => {
                displayGroupDetails(group);
            });

            // 마커 추가
            marker.addTo(map);
            markers.push(marker);

        } catch (error) {
            console.error(`마커 생성 중 오류 (Group ${groupIndex}):`, error);
        }
    });

    // 모든 마커를 포함하도록 지도 뷰를 조정
    if (markers.length > 0) {
        try {
            const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
            map.fitBounds(bounds.pad(0.1));
            console.log('지도 뷰가 마커들에 맞게 조정되었습니다.');
        } catch (error) {
            console.error('지도 뷰 조정 중 오류:', error);
        }
    }

    // 라벨 가시성 업데이트
    setTimeout(() => {
        updateLabelVisibility();
    }, 500);
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
    // 괄호 안의 한글 부분을 먼저 찾기 (예: "와이탄 (The Bund)")
    const koreanInParentheses = text.match(/\(([가-힣\s]+)\)/);
    if (koreanInParentheses && koreanInParentheses[1].trim() !== '') {
        return koreanInParentheses[1].trim();
    }

    // 괄호가 없다면 전체 텍스트에서 첫 번째 한글 덩어리 추출
    const koreanParts = text.match(/[가-힣\s]+/g);
    if (koreanParts && koreanParts.length > 0) {
        // 비어있는 문자열 필터링 후 첫 번째 비어있지 않은 한글 부분 반환
        const filteredParts = koreanParts.filter(part => part.trim() !== '');
        if (filteredParts.length > 0) {
            return filteredParts[0].trim();
        }
    }

    // 한글이 없다면 원본 텍스트 반환 (영어나 숫자 등)
    return text;
}

// 커스텀 아이콘 생성 함수 (원형 마커)
function createCustomIcon(type) {
    let iconClass, bgClass;

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
        default:
            iconClass = 'fas fa-map-marker-alt';
            bgClass = 'tourism-bg'; // 기본값
    }

    // L.divIcon을 사용하여 커스텀 HTML 기반 마커 생성
    try {
        return L.divIcon({
            className: 'google-circle-marker',
            html: `<div class="circle-marker ${bgClass}">
                         <i class="${iconClass}"></i>
                       </div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9], // 아이콘 중심을 마커의 중심에 맞춤
            tooltipAnchor: [0, 15] // 툴팁이 아이콘 하단에 나타나도록 설정
        });
    } catch (e) {
        console.error(`L.divIcon 생성 오류 (Type: ${type}):`, e);
        return null; // 오류 발생 시 null 반환
    }
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

// 타입별 아이콘 반환 함수
function getTypeIcon(type) {
    switch (type) {
        case 'attractions': return '📷';
        case 'restaurants': return '🍴';
        case 'airports': return '✈️';
        case 'hotels': return '🏨';
        default: return '📍';
    }
}

// 타입별 한국어 이름 반환 함수
function getTypeDisplayName(type) {
    switch (type) {
        case 'attractions': return '관광지';
        case 'restaurants': return '음식점';
        case 'airports': return '공항';
        case 'hotels': return '호텔';
        default: return '기타';
    }
}
