// 전역 변수
let map;
let markers = L.featureGroup();
let currentTileLayer;
let shanghaiData = null;
let allMarkers = []; // 모든 마커를 저장할 배열
let currentLocationMarker = null; // 현재 위치 마커
let markerGroups = {
    attractions: L.featureGroup(),
    restaurants: L.featureGroup(),
    hotels: L.featureGroup(),
    airports: L.featureGroup()
};

// 문서 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initializeMap();
    setupEventListeners();
});

// 데이터 로드 함수
async function loadData() {
    try {
        const response = await fetch('data/shanghai-data.json');
        shanghaiData = await response.json();
        console.log('데이터 로드 완료:', shanghaiData);
    } catch (error) {
        console.error('데이터 로드 실패:', error);
        // 로드 실패 시 빈 데이터로 초기화
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
    const koreanInParentheses = text.match(/\(([가-힣\s]+)/);
    if (koreanInParentheses) {
        return koreanInParentheses[1].trim();
    }
    
    // 괄호가 없다면 전체 텍스트에서 한글 부분 추출
    const koreanParts = text.match(/[가-힣\s]+/g);
    if (koreanParts && koreanParts.length > 0) {
        return koreanParts[0].trim();
    }
    
    // 한글이 없다면 원본 텍스트 반환
    return text;
}

// 지도 초기화 함수
function initializeMap() {
    // 지도 초기화 (상하이 중심)
    map = L.map('map').setView([31.2304, 121.4737], 12);

    // 다양한 타일 레이어 정의
    const tileLayers = {
        cartodb: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }),
        street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, GeoEye, Earthstar Geographics',
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

    // 줌 레벨 변경 시 라벨 가시성 업데이트
    map.on('zoomend', () => {
        updateLabelVisibility();
    });
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // ESC 키로 정보 박스 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeInfoBox();
        }
    });

    // 지도 클릭 시 정보 박스 닫기
    map.on('click', (e) => {
        if (e.originalEvent && e.originalEvent.target === e.originalEvent.currentTarget) {
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

// 마커 그룹 토글 함수
function toggleMarkerGroup(type, show) {
    if (show) {
        markerGroups[type].addTo(map);
    } else {
        map.removeLayer(markerGroups[type]);
    }
    
    setTimeout(() => {
        updateLabelVisibility();
    }, 100);
}

// 마커 표시 함수
function displayMarkers() {
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('데이터가 없습니다.');
        return;
    }

    // 기존 마커들 제거
    Object.values(markerGroups).forEach(group => {
        group.clearLayers();
    });
    allMarkers = [];

    // 모든 장소 데이터 합치기
    const allPlaces = [];
    const types = ['attractions', 'restaurants', 'hotels', 'airports'];
    
    types.forEach(type => {
        const places = shanghaiData.shanghai_tourism[type];
        places.forEach(place => {
            allPlaces.push({...place, type: type});
        });
    });

    // 위치별로 장소들을 그룹화
    const locationGroups = {};
    
    allPlaces.forEach(place => {
        const lat = parseFloat(place.latitude).toFixed(4);
        const lng = parseFloat(place.longitude).toFixed(4);
        const locationKey = `${lat},${lng}`;
        
        if (!locationGroups[locationKey]) {
            locationGroups[locationKey] = {
                latitude: place.latitude,
                longitude: place.longitude,
                places: []
            };
        }
        
        locationGroups[locationKey].places.push(place);
    });

    // 각 위치 그룹에 대해 마커 생성
    Object.values(locationGroups).forEach(group => {
        // 우선순위가 높은 타입으로 마커 아이콘 결정
        const priorityOrder = { 'airports': 1, 'attractions': 2, 'hotels': 3, 'restaurants': 4 };
        const mainType = group.places.reduce((prev, curr) => 
            priorityOrder[prev.type] < priorityOrder[curr.type] ? prev : curr
        ).type;

        // 마커 생성
        const marker = L.marker([group.latitude, group.longitude], {
            icon: createCustomIcon(mainType)
        }).addTo(markerGroups[mainType]);

        // 라벨 텍스트 생성 (한글만 추출)
        let labelText;
        if (group.places.length === 1) {
            labelText = extractKorean(group.places[0].name);
        } else {
            const firstPlaceName = extractKorean(group.places[0].name);
            labelText = `${firstPlaceName} 외 ${group.places.length - 1}곳`;
        }

        // 클릭 이벤트
        marker.on('click', () => {
            displayGroupDetails(group);
            map.flyTo([group.latitude, group.longitude], 15);
        });

        // 툴팁(라벨) 바인딩 - 머티리얼 디자인 적용
        marker.bindTooltip(labelText, {
            permanent: true,
            direction: 'top',
            offset: [15, -30],
            className: 'material-label',
            opacity: 1
        });

        // 마커 정보 저장
        allMarkers.push({
            marker: marker,
            labelText: labelText,
            group: group,
            labelVisible: false,
            groupType: mainType
        });
    });

    // 지도 뷰 조정
    const allMarkersLayer = L.featureGroup();
    Object.values(markerGroups).forEach(group => {
        group.getLayers().forEach(layer => {
            allMarkersLayer.addLayer(layer);
        });
    });
    
    if (allMarkersLayer.getLayers().length > 0) {
        map.fitBounds(allMarkersLayer.getBounds().pad(0.1));
    }

    // 초기 라벨 가시성 설정
    setTimeout(() => {
        updateLabelVisibility();
    }, 500);
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
            
            // 지도를 현재 위치로 이동
            map.setView([lat, lng], 15);
            
            // 기존 현재 위치 마커 제거
            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
            }
            
            // 현재 위치 마커 생성
            currentLocationMarker = L.marker([lat, lng], {
                icon: createCurrentLocationIcon()
            }).addTo(map);
            
            currentLocationMarker.bindTooltip('현재 위치', {
                permanent: false,
                direction: 'top',
                offset: [0, -25],
                className: 'material-label current-location-label'
            });
            
            resetLocateButton();
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
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}

// 위치 버튼 리셋
function resetLocateButton() {
    const locateBtn = document.getElementById('locate-btn');
    const icon = locateBtn.querySelector('i');
    
    icon.className = 'fas fa-location-crosshairs';
    locateBtn.disabled = false;
}

// 현재 위치 아이콘 생성
function createCurrentLocationIcon() {
    return L.divIcon({
        className: 'current-location-marker',
        html: `<div class="location-pulse">
                 <div class="location-dot"></div>
               </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}
function updateLabelVisibility() {
    const currentZoom = map.getZoom();
    
    allMarkers.forEach(markerData => {
        const isGroupVisible = map.hasLayer(markerGroups[markerData.groupType]);
        
        if (currentZoom >= 11 && isGroupVisible) {
            // 라벨 표시
            if (!markerData.labelVisible) {
                markerData.marker.openTooltip();
                markerData.labelVisible = true;
            }
        } else {
            // 라벨 숨기기
            if (markerData.labelVisible) {
                markerData.marker.closeTooltip();
                markerData.labelVisible = false;
            }
        }
    });
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
            bgClass = 'tourism-bg';
    }

    return L.divIcon({
        className: 'google-circle-marker',
        html: `<div class="circle-marker ${bgClass}">
                 <i class="${iconClass}"></i>
               </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// 그룹 상세 정보 표시 함수
function displayGroupDetails(group) {
    const infoBox = document.getElementById('place-details');
    const placeContent = document.getElementById('place-content');
    
    let detailsHtml = '';
    
    if (group.places.length === 1) {
        // 단일 장소
        const place = group.places[0];
        detailsHtml = `
            <div class="place-type-badge type-${place.type}">
                ${getTypeIcon(place.type)} ${getTypeDisplayName(place.type)}
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

        // 지도 연결 버튼
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
        // 여러 장소 그룹
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
                        ${getTypeIcon(place.type)} ${getTypeDisplayName(place.type)}
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
            
            if (index < group.places.length - 1) {
                detailsHtml += `<div class="place-separator"></div>`;
            }
        });

        // 그룹 전체 지도 연결 버튼
        const firstPlace = group.places[0];
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

    placeContent.innerHTML = detailsHtml;
    infoBox.classList.add('show');
}

// 구글지도 열기 함수 (주소 기반)
function openGoogleMaps(address, lat, lng) {
    const encodedAddress = encodeURIComponent(address);
    const googleMapsUrl = `https://www.google.com/maps/search/${encodedAddress}/@${lat},${lng},17z`;
    window.open(googleMapsUrl, '_blank');
}

// 가오더지도 열기 함수 (주소 기반)
function openAmapSearch(address, lat, lng) {
    const encodedAddress = encodeURIComponent(address);
    const amapUrl = `https://ditu.amap.com/search?query=${encodedAddress}&city=上海&geoobj=${lng}|${lat}|${lng}|${lat}&zoom=17`;
    window.open(amapUrl, '_blank');
}

// 정보 박스 닫기 함수
function closeInfoBox() {
    const infoBox = document.getElementById('place-details');
    infoBox.classList.remove('show');
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