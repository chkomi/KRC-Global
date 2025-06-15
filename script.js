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

        // 라벨은 첫 번째 장소 이름 또는 그룹 수가 많으면 "여러 장소"로 표시
        let labelText;
        if (group.places.length === 1) {
            labelText = group.places[0].name;
        } else {
            labelText = `${group.places[0].name} 외 ${group.places.length - 1}곳`;
        }

        // 라벨 생성
        const tooltip = L.tooltip({
            permanent: true,
            direction: 'bottom',
            offset: [0, 15],
            className: 'place-label',
            opacity: 0.9
        }).setContent(labelText);

        marker.on('click', () => {
            displayGroupDetails(group);
            map.flyTo([group.latitude, group.longitude], 15);
        });

        // 마커 정보를 배열에 저장
        allMarkers.push({
            marker: marker,
            tooltip: tooltip,
            group: group,
            visible: false,
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

// 그룹 상세 정보 표시 함수
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
    } else {
        // 여러 장소인 경우 그룹으로 표시
        detailsHtml = `<h3><i class="fas fa-map-marker-alt"></i> 이 위치의 장소들 (${group.places.length}곳)</h3>`;
        
        group.places.forEach((place, index) => {
            detailsHtml += `
                <div class="place-group-item" style="margin-bottom: 15px; padding: 10px; border-left: 3px solid ${getTypeColor(place.type)}; background: rgba(0,0,0,0.05); border-radius: 4px;">
                    <div class="place-type-badge type-${place.type}" style="margin-bottom: 5px;">
                        ${getTypeIcon(place.type)} ${getTypeDisplayName(place.type)}
                    </div>
                    <h4 style="margin: 5px 0; color: #2c3e50;">${place.name}</h4>
            `;
            
            if (place.description) {
                detailsHtml += `<p style="margin: 5px 0; font-size: 0.85em;"><strong>설명:</strong> ${place.description}</p>`;
            }
            
            if (place.address && place.address !== "N/A") {
                detailsHtml += `<p style="margin: 5px 0; font-size: 0.85em;"><strong>주소:</strong> ${place.address}</p>`;
            }
            
            if (place.features && place.features.length > 0) {
                detailsHtml += `<p style="margin: 5px 0; font-size: 0.85em;"><strong>특징:</strong> ${place.features.join(', ')}</p>`;
            }
            
            if (place.menu && place.menu.length > 0) {
                detailsHtml += `<p style="margin: 5px 0; font-size: 0.85em;"><strong>메뉴:</strong> ${place.menu.join(', ')}</p>`;
            }
            
            detailsHtml += `</div>`;
        });
    }

    placeContent.innerHTML = detailsHtml;
    infoBox.classList.add('show');
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

// 라벨 가시성 업데이트 함수 (개선된 버전)
function updateLabelVisibility() {
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();
    
    // 모든 라벨 숨기기
    allMarkers.forEach(markerData => {
        if (markerData.visible) {
            markerData.tooltip.removeFrom(map);
            markerData.visible = false;
        }
    });

    // 현재 보이는 마커 그룹의 마커들만 필터링
    const visibleMarkers = allMarkers.filter(markerData => {
        const latLng = markerData.marker.getLatLng();
        const isInBounds = bounds.contains(latLng);
        const isGroupVisible = map.hasLayer(markerGroups[markerData.group]);
        return isInBounds && isGroupVisible;
    });

    if (visibleMarkers.length === 0) return;

    // 각 마커에 대해 최적의 라벨 위치 찾기
    visibleMarkers.forEach(markerData => {
        const markerPos = map.latLngToContainerPoint(markerData.marker.getLatLng());
        const directions = ['right', 'left', 'top', 'bottom', 'topright', 'topleft', 'bottomright', 'bottomleft'];
        
        let bestDirection = 'right'; // 기본값
        let bestScore = -1;

        // 각 방향에 대해 점수 계산
        for (const direction of directions) {
            const offset = getTooltipOffset(direction);
            const labelPos = {
                x: markerPos.x + offset[0],
                y: markerPos.y + offset[1]
            };

            let score = 100; // 기본 점수

            // 화면 경계 체크 (경계를 벗어나면 점수 감소)
            const mapSize = map.getSize();
            const labelWidth = markerData.place.name.length * 7; // 라벨 너비 추정
            const labelHeight = 20;
            
            if (labelPos.x - labelWidth/2 < 10) score -= 50;
            if (labelPos.x + labelWidth/2 > mapSize.x - 10) score -= 50;
            if (labelPos.y - labelHeight/2 < 10) score -= 50;
            if (labelPos.y + labelHeight/2 > mapSize.y - 10) score -= 50;

            // 마커와의 거리 체크 (너무 가까우면 점수 감소)
            const distanceToMarker = Math.sqrt(offset[0] * offset[0] + offset[1] * offset[1]);
            if (distanceToMarker < 20) score -= 30;

            // 우선순위 방향 (오른쪽과 왼쪽을 선호)
            if (direction === 'right') score += 10;
            if (direction === 'left') score += 8;
            if (direction === 'top' || direction === 'bottom') score += 5;

            if (score > bestScore) {
                bestScore = score;
                bestDirection = direction;
            }
        }

        // 최소 점수 이상이면 라벨 표시
        if (bestScore >= 0) {
            const offset = getTooltipOffset(bestDirection);
            
            // 툴팁 설정 및 표시
            markerData.tooltip.options.direction = bestDirection;
            markerData.tooltip.options.offset = offset;
            markerData.tooltip.options.opacity = 0.9;
            
            markerData.marker.bindTooltip(markerData.tooltip);
            markerData.visible = true;
        }
    });
}

// 툴팁 오프셋 계산 함수 (마커와 적절한 거리 유지)
function getTooltipOffset(direction) {
    const baseOffset = 22; // 마커와의 기본 거리
    switch (direction) {
        case 'top': return [0, -baseOffset];
        case 'bottom': return [0, baseOffset];
        case 'right': return [baseOffset, 0];
        case 'left': return [-baseOffset, 0];
        case 'topright': return [baseOffset * 0.8, -baseOffset * 0.8];
        case 'topleft': return [-baseOffset * 0.8, -baseOffset * 0.8];
        case 'bottomright': return [baseOffset * 0.8, baseOffset * 0.8];
        case 'bottomleft': return [-baseOffset * 0.8, baseOffset * 0.8];
        default: return [baseOffset, 0];
    }
}

// 커스텀 아이콘 생성 함수
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
        className: 'custom-marker-icon',
        html: `<div class="marker-content ${bgClass}">
                 <i class="${iconClass}"></i>
               </div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        tooltipAnchor: [0, -15]
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