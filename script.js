// 전역 변수
let map;
let markers = L.featureGroup();
let currentTileLayer;
let shanghaiData = null;
let allMarkers = []; // 모든 마커를 저장할 배열
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

    // 기본 심플 타일 레이어 추가 (실제로 cartodb 적용)
    currentTileLayer = tileLayers.cartodb;
    currentTileLayer.addTo(map);

    console.log('기본 지도 타일:', 'cartodb'); // 디버깅용

    // 타일 레이어 변경 이벤트 리스너
    document.querySelectorAll('input[name="tile-layer"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                // 기존 타일 레이어 제거
                map.removeLayer(currentTileLayer);
                
                // 새 타일 레이어 추가
                currentTileLayer = tileLayers[this.value];
                currentTileLayer.addTo(map);
                
                // 활성 상태 업데이트
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
    map.on('zoomend moveend', () => {
        updateLabelVisibility();
        // 모든 라벨 위치 업데이트
        allMarkers.forEach(markerData => {
            if (markerData.labelVisible) {
                updateLabelPosition(markerData);
            }
        });
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
        // 마커가 아닌 지도 영역을 클릭했을 때만 정보 박스 닫기
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
}

// 마커 그룹 토글 함수
function toggleMarkerGroup(type, show) {
    if (show) {
        markerGroups[type].addTo(map);
    } else {
        map.removeLayer(markerGroups[type]);
        // 해당 그룹의 라벨들 숨기기
        allMarkers.forEach(markerData => {
            if (markerData.groupType === type && markerData.labelVisible) {
                markerData.labelElement.style.display = 'none';
                markerData.labelVisible = false;
            }
        });
    }
    // 라벨 가시성 업데이트
    setTimeout(() => {
        updateLabelVisibility();
    }, 100);
}

// 마커 표시 함수 (같은 위치 장소 그룹화)
function displayMarkers() {
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('데이터가 없습니다.');
        return;
    }

    // 기존 마커들과 라벨들 제거
    Object.values(markerGroups).forEach(group => {
        group.clearLayers();
    });
    
    // 기존 라벨 요소들 제거
    allMarkers.forEach(markerData => {
        if (markerData.labelElement) {
            markerData.labelElement.remove();
        }
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

    // 위치별로 장소들을 그룹화 (소수점 4자리까지 같으면 같은 위치로 간주)
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
        // 그룹에서 가장 우선순위가 높은 타입으로 마커 아이콘 결정
        const priorityOrder = { 'airports': 1, 'attractions': 2, 'hotels': 3, 'restaurants': 4 };
        const mainType = group.places.reduce((prev, curr) => 
            priorityOrder[prev.type] < priorityOrder[curr.type] ? prev : curr
        ).type;

        const marker = L.marker([group.latitude, group.longitude], {
            icon: createCustomIcon(mainType)
        }).addTo(markerGroups[mainType]);

        // 라벨 텍스트 생성
        let labelText;
        if (group.places.length === 1) {
            // name 사용
            labelText = group.places[0].name;
        } else {
            const firstPlaceName = group.places[0].name;
            labelText = `${firstPlaceName} 외 ${group.places.length - 1}곳`;
        }

        marker.on('click', () => {
            displayGroupDetails(group);
            map.flyTo([group.latitude, group.longitude], 15);
        });

        // 구글 스타일 라벨 생성
        const labelElement = createGoogleStyleLabel(labelText);
        
        // 마커 정보를 배열에 저장
        allMarkers.push({
            marker: marker,
            labelText: labelText,
            labelElement: labelElement,
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

// 구글 스타일 라벨 생성 함수
function createGoogleStyleLabel(text) {
    const labelElement = document.createElement('div');
    labelElement.className = 'google-style-label';
    labelElement.textContent = text;
    labelElement.style.display = 'none'; // 초기에는 숨김
    
    // 지도 컨테이너에 추가
    map.getContainer().appendChild(labelElement);
    
    return labelElement;
}

// 라벨 가시성 업데이트 함수 (구글 지도 스타일)
function updateLabelVisibility() {
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();
    
    // 줌 레벨이 너무 낮으면 라벨 숨기기
    if (currentZoom < 11) {
        allMarkers.forEach(markerData => {
            if (markerData.labelVisible) {
                markerData.labelElement.style.display = 'none';
                markerData.labelVisible = false;
            }
        });
        return;
    }

    // 현재 보이는 마커 그룹의 마커들 처리
    allMarkers.forEach(markerData => {
        const latLng = markerData.marker.getLatLng();
        const isInBounds = bounds.contains(latLng);
        const isGroupVisible = map.hasLayer(markerGroups[markerData.groupType]);
        
        if (isInBounds && isGroupVisible) {
            if (!markerData.labelVisible && markerData.labelElement) {
                markerData.labelElement.style.display = 'block';
                markerData.labelVisible = true;
                updateLabelPosition(markerData);
            }
        } else {
            if (markerData.labelVisible && markerData.labelElement) {
                markerData.labelElement.style.display = 'none';
                markerData.labelVisible = false;
            }
        }
    });
}

// 라벨 위치 업데이트 함수
function updateLabelPosition(markerData) {
    if (!markerData.labelElement) return;
    
    const markerPos = map.latLngToContainerPoint(markerData.marker.getLatLng());
    // 구글 지도 스타일: 마커 오른쪽 상단에 약간 떨어져서 배치
    markerData.labelElement.style.left = (markerPos.x + 15) + 'px';
    markerData.labelElement.style.top = (markerPos.y - 25) + 'px';
}

// 그룹 상세 정보 표시 함수 (지도 연결 버튼 추가)
function displayGroupDetails(group) {
    const infoBox = document.getElementById('place-details');
    const placeContent = document.getElementById('place-content');
    
    let detailsHtml = '';
    
    if (group.places.length === 1) {
        // 단일 장소인 경우 기존 방식대로 표시
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

        // 지도 연결 버튼 추가
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
        // 여러 장소인 경우 그룹으로 표시
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

            // 각 장소별 지도 연결 버튼
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
            
            // 마지막 항목이 아니면 구분선 추가
            if (index < group.places.length - 1) {
                detailsHtml += `<div class="place-separator"></div>`;
            }
        });

        // 그룹 전체 위치 지도 연결 버튼
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

// 가오더지도(Amap) 열기 함수 (주소 기반)
function openAmapSearch(address, lat, lng) {
    const encodedAddress = encodeURIComponent(address);
    // 가오더지도 웹 검색 URL
    const amapUrl = `https://ditu.amap.com/search?query=${encodedAddress}&city=上海&geoobj=${lng}|${lat}|${lng}|${lat}&zoom=17`;
    window.open(amapUrl, '_blank');
}

// 타입별 색상 반환 함수
function getTypeColor(type) {
    switch (type) {
        case 'attractions': return '#e74c3c';
        case 'restaurants': return '#27ae60';
        case 'airports': return '#9b59b6';
        case 'hotels': return '#3498db';
        default: return '#95a5a6';
    }
}

// 커스텀 아이콘 생성 함수 (구글 지도 스타일 - 원형 마커)
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
        iconAnchor: [10, 10],
        tooltipAnchor: [0, -20]
    });
}

// 장소 상세 정보 표시 함수
function displayPlaceDetails(place) {
    const infoBox = document.getElementById('place-details');
    const placeContent = document.getElementById('place-content');
    
    let detailsHtml = `
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

    placeContent.innerHTML = detailsHtml;
    infoBox.classList.add('show');
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