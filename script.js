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
    attractions: '#ea4335', // 관광지 (Google Red)
    restaurants: '#34a853', // 음식점 (Google Green)
    airports: '#9b59b6',    // 공항 (Purple)
    hotels: '#1a73e8'      // 호텔 (Google Blue)
};

// 문서 로드 완료 시 초기화 - 더 안전한 방법
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 로드 완료');
    initializeApp();
});

// 앱 초기화 함수
async function initializeApp() {
    try {
        await loadData(); // 데이터 로드
        console.log('데이터 로드 완료, 지도 초기화 시작');
        initializeMap();   // 지도 초기화
        setupEventListeners(); // 이벤트 리스너 설정
    } catch (error) {
        console.error('앱 초기화 오류:', error);
        alert('지도를 로드하는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.');
    }
}

// 데이터 로드 함수
async function loadData() {
    try {
        const response = await fetch('data/shanghai-data.json'); // 'data' 폴더에서 JSON 로드
        if (!response.ok) { // HTTP 응답이 성공(200-299)이 아니면 에러 발생
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        shanghaiData = await response.json();
        console.log('데이터 로드 완료:', shanghaiData);

        // 데이터가 비어있을 경우 초기화 메시지
        if (!shanghaiData || !shanghaiData.shanghai_tourism || Object.keys(shanghaiData.shanghai_tourism).every(key => shanghaiData.shanghai_tourism[key].length === 0)) {
             console.warn('로드된 데이터에 장소 정보가 없습니다. 지도가 비어있을 수 있습니다.');
        }

    } catch (error) {
        console.error('데이터 로드 실패:', error);
        // 데이터 로드 실패 시 빈 데이터로 초기화하여 앱이 작동은 하도록 함
        shanghaiData = {
            shanghai_tourism: {
                attractions: [],
                restaurants: [],
                hotels: [],
                airports: []
            }
        };
        alert('여행 데이터를 로드하지 못했습니다. 지도가 정상적으로 표시되지 않을 수 있습니다. 콘솔을 확인해주세요.');
    }
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
            iconAnchor: [9, 9] // 아이콘 중심을 마커의 중심에 맞춤
        });
    } catch (e) {
        console.error(`L.divIcon 생성 오류 (Type: ${type}):`, e);
        return null; // 오류 발생 시 null 반환
    }
}

// 지도 초기화 함수
function initializeMap() {
    // Leaflet이 로드되었는지 확인
    if (typeof L === 'undefined') {
        console.error('Leaflet 라이브러리가 로드되지 않았습니다.');
        alert('지도 라이브러리 로드 오류. 페이지를 새로고침해주세요.');
        return;
    }

    // 지도 컨테이너가 존재하는지 확인
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('지도 컨테이너를 찾을 수 없습니다.');
        return;
    }

    try {
        // 지도 초기화 (상하이 중심 좌표, 초기 줌 레벨 12)
        map = L.map('map', {
            preferCanvas: true, // 성능 향상을 위해 Canvas 렌더링 사용
            zoomControl: true
        }).setView([31.2304, 121.4737], 12);

        console.log('지도 객체 생성 완료:', map);

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
        
        console.log('기본 타일 레이어 추가 완료');

        // 타일 레이어 변경 이벤트 리스너
        document.querySelectorAll('input[name="tile-layer"]').forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.checked) {
                    map.removeLayer(currentTileLayer); // 기존 레이어 제거
                    currentTileLayer = tileLayers[this.value]; // 새 레이어 설정
                    currentTileLayer.addTo(map); // 새 레이어 추가

                    // 현재 선택된 타일 옵션에 'active' 클래스 추가하여 시각적 피드백 제공
                    document.querySelectorAll('.tile-option').forEach(option => {
                        option.classList.remove('active');
                    });
                    this.parentElement.classList.add('active');
                }
            });
        });

        // 마커 그룹들을 지도에 추가 (초기에는 비어있지만, 미리 추가)
        Object.values(markerGroups).forEach(group => {
            group.addTo(map);
        });

        // 지도가 준비되면 마커 표시
        map.whenReady(() => {
            console.log('지도 준비 완료, 마커 표시 시작');
            displayMarkers();
        });

        // 줌 레벨 변경 시 라벨 가시성 업데이트 (디바운싱 적용으로 성능 최적화)
        map.on('zoomend', () => {
            if (labelUpdateTimeout) {
                clearTimeout(labelUpdateTimeout); // 기존 타이머가 있다면 취소
            }
            // 100ms 후에 라벨 업데이트 (부드러운 전환을 위해)
            labelUpdateTimeout = setTimeout(() => {
                updateLabelVisibility();
            }, 100);
        });

        console.log('지도 초기화 완료');

    } catch (error) {
        console.error('지도 초기화 중 오류 발생:', error);
        alert('지도 초기화 오류가 발생했습니다.');
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

// 마커 표시 함수
function displayMarkers() {
    console.log('displayMarkers 함수 시작.');
    
    if (!map) {
        console.error('지도 객체가 없습니다.');
        return;
    }
    
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('마커를 표시할 데이터가 없습니다. shanghaiData 또는 shanghai_tourism이 정의되지 않았습니다.');
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
        if (Array.isArray(places)) { // 'places'가 배열인지 확인
            places.forEach(place => {
                allPlaces.push({...place, type: type}); // 각 장소에 타입 정보 추가
            });
        } else {
            console.warn(`데이터에 "${type}" 카테고리가 유효한 배열이 아닙니다.`, places);
        }
    });

    if (allPlaces.length === 0) {
        console.warn('로드된 데이터에서 유효한 장소를 찾을 수 없습니다. 마커가 표시되지 않습니다.');
        return;
    }
    console.log(`총 ${allPlaces.length}개의 장소 데이터 처리 시작.`);

    // 위치(좌표)별로 장소들을 그룹화 (동일 좌표에 여러 장소가 있을 수 있으므로)
    const locationGroups = {};
    allPlaces.forEach(place => {
        // 유효한 위도/경도 값인지 확인
        const lat = parseFloat(place.latitude);
        const lng = parseFloat(place.longitude);

        if (isNaN(lat) || isNaN(lng)) {
            console.warn(`유효하지 않은 좌표 발견: ${place.name} (위도: ${place.latitude}, 경도: ${place.longitude}) - 이 장소는 마커로 표시되지 않습니다.`);
            return; // 유효하지 않은 좌표는 건너뛰기
        }

        // 부동 소수점 문제 방지를 위해 위도, 경도 정밀도를 고정하여 키 생성
        const locationKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;

        if (!locationGroups[locationKey]) {
            locationGroups[locationKey] = {
                latitude: lat,
                longitude: lng,
                places: [] // 이 위치에 해당하는 모든 장소들
            };
        }
        locationGroups[locationKey].places.push(place);
    });

    if (Object.keys(locationGroups).length === 0) {
        console.warn('유효한 좌표를 가진 장소 그룹이 없습니다. 마커가 표시되지 않습니다.');
        return;
    }
    console.log(`총 ${Object.keys(locationGroups).length}개의 고유한 위치에 마커 생성 시작.`);

    let markerCount = 0;

    // 각 위치 그룹에 대해 마커 생성
    Object.values(locationGroups).forEach((group, groupIndex) => {
        try {
            // 동일 좌표에 여러 타입의 장소가 있을 경우, 아이콘 표시 우선순위를 결정
            const priorityOrder = { 'airports': 1, 'attractions': 2, 'hotels': 3, 'restaurants': 4 };
            const mainType = group.places.reduce((prev, curr) =>
                (priorityOrder[prev.type] < priorityOrder[curr.type] ? prev : curr)
            ).type;

            // 마커 생성 및 해당 마커 그룹에 추가
            const customIcon = createCustomIcon(mainType);
            if (!customIcon) {
                console.error(`아이콘 생성 실패 for group ${groupIndex} (Type: ${mainType}). 이 마커는 표시되지 않습니다.`);
                return;
            }

            const marker = L.marker([group.latitude, group.longitude], {
                icon: customIcon
            }).addTo(markerGroups[mainType]);

            markerCount++;

            // 라벨 텍스트 생성 (한글 부분만 추출)
            let labelText;
            if (group.places.length === 1) {
                const place = group.places[0];
                labelText = extractKorean(place.name);
                if (place.type === 'hotels' && place.price) {
                    const formattedPrice = `₩${parseInt(place.price).toLocaleString('ko-KR')}`;
                    labelText += `<br><span style="font-size:0.8em; color:#555;">${formattedPrice}</span>`;
                }
            } else {
                const firstPlaceName = extractKorean(group.places[0].name);
                labelText = `${firstPlaceName} 외 ${group.places.length - 1}곳`;
            }

            // 마커 클릭 시 팝업 표시 및 지도를 해당 위치로 이동
            marker.on('click', () => {
                console.log(`마커 클릭됨: ${group.places[0].name}`);
                displayGroupDetailsAsPopup(marker, group); // 팝업으로 변경된 함수 호출
                map.flyTo([group.latitude, group.longitude], 15); // 클릭 시 줌 레벨 15로 확대
            });

            // 툴팁(라벨)을 마커 하단에 바인딩
            const tooltip = marker.bindTooltip(labelText, {
                permanent: true,
                direction: 'bottom',
                offset: [0, 5],
                className: 'custom-marker-tooltip',
                opacity: 1
            });

            // 라벨 가시성 제어를 위해 마커 정보를 배열에 저장
            allMarkers.push({
                marker: marker,
                labelText: labelText,
                group: group,
                labelVisible: false,
                groupType: mainType,
                tooltip: tooltip
            });

        } catch (error) {
            console.error(`마커 생성 중 오류 (Group ${groupIndex}):`, error);
        }
    });

    console.log(`${markerCount}개의 마커가 생성되었습니다.`);

    // 모든 마커를 포함하도록 지도 뷰를 조정
    const allMarkersLayer = L.featureGroup();
    Object.values(markerGroups).forEach(group => {
        group.getLayers().forEach(layer => {
            allMarkersLayer.addLayer(layer);
        });
    });

    if (allMarkersLayer.getLayers().length > 0) {
        try {
            map.fitBounds(allMarkersLayer.getBounds().pad(0.1)); // 모든 마커가 보이도록 지도 뷰 조정
            console.log('지도 뷰가 마커들에 맞게 조정되었습니다.');
        } catch (error) {
            console.error('지도 뷰 조정 중 오류:', error);
        }
    } else {
        console.warn('표시할 마커가 없어 지도 뷰를 조정할 수 없습니다.');
    }

    // 툴팁 엘리먼트들이 DOM에 추가된 후에 참조를 설정
    setTimeout(() => {
        let tooltipCount = 0;
        allMarkers.forEach((markerData, index) => {
            try {
                const tooltipElement = markerData.marker._tooltip._container;
                if (tooltipElement) {
                    markerData.tooltipElement = tooltipElement;
                    tooltipElement.style.borderLeft = `4px solid ${markerColors[markerData.groupType] || '#3498db'}`;
                    tooltipCount++;
                }
            } catch (error) {
                console.warn(`툴팁 설정 실패 (마커 ${index}):`, error);
            }
        });
        console.log(`${tooltipCount}개의 툴팁이 설정되었습니다.`);
        updateLabelVisibility();
        console.log('툴팁 엘리먼트 설정 및 라벨 가시성 업데이트 완료.');
    }, 300);
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
                direction: 'top',
                offset: [0, -25],
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
        iconAnchor: [10, 10]
    });
}

// 줌 레벨에 따라 라벨 가시성 업데이트 함수
function updateLabelVisibility() {
    const currentZoom = map.getZoom();
    const minZoomForLabels = 14;

    allMarkers.forEach((markerData) => {
        const isGroupVisible = map.hasLayer(markerGroups[markerData.groupType]);
        const tooltipElement = markerData.tooltipElement;

        if (!tooltipElement) {
            return;
        }

        if (currentZoom >= minZoomForLabels && isGroupVisible) {
            if (!markerData.labelVisible) {
                tooltipElement.classList.add('show-label');
                markerData.labelVisible = true;
            }
        } else {
            if (markerData.labelVisible) {
                tooltipElement.classList.remove('show-label');
                markerData.labelVisible = false;
            }
        }
    });
}

// 그룹 상세 정보 팝업 표시 함수
function displayGroupDetailsAsPopup(marker, group) {
    let detailsHtml = '';

    if (group.places.length === 1) {
        const place = group.places[0];
        detailsHtml = `
            <div class="popup-header">
                <div class="place-type-badge type-${place.type}">
                    ${getTypeIcon(place.type)} ${getTypeDisplayName(place.type)}
                </div>
                <h3><i class="fas fa-map-marker-alt"></i> ${place.name}</h3>
            </div>
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
        if (place.type === 'hotels' && place.price) {
            const formattedPrice = `₩${parseInt(place.price).toLocaleString('ko-KR')}`;
            detailsHtml += `<p><strong>💰 가격:</strong> ${formattedPrice}</p>`;
        }

        detailsHtml += `
            <div class="map-links">
                <h4><i class="fas fa-external-link-alt"></i> 외부 지도에서 보기</h4>
                <div class="map-buttons">
                    <button class="map-btn google-btn" onclick="openGoogleMaps('${place.name}', ${place.latitude}, ${place.longitude})">
                        <i class="fab fa-google"></i> 구글지도
                    </button>
                    <button class="map-btn amap-btn" onclick="openAmapSearch('${place.name}', ${place.latitude}, ${place.longitude})">
                        <i class="fas fa-map"></i> 가오더지도
                    </button>
                </div>
            </div>
        `;
    } else {
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
            if (place.type === 'hotels' && place.price) {
                const formattedPrice = `₩${parseInt(place.price).toLocaleString('ko-KR')}`;
                detailsHtml += `<p><strong>가격:</strong> ${formattedPrice}</p>`;
            }

            detailsHtml += `
                <div class="place-map-buttons">
                    <button class="map-btn-small google-btn" onclick="openGoogleMaps('${place.name}', ${place.latitude}, ${place.longitude})" title="구글지도에서 ${place.name} 검색">
                        <i class="fab fa-google"></i>
                    </button>
                    <button class="map-btn-small amap-btn" onclick="openAmapSearch('${place.name}', ${place.latitude}, ${place.longitude})" title="가오더지도에서 ${place.name} 검색">
                        <i class="fas fa-map"></i>
                    </button>
                </div>
            `;
            detailsHtml += `</div>`;

            if (index < group.places.length - 1) {
                detailsHtml += `<div class="place-separator"></div>`;
            }
        });

        const firstPlace = group.places[0];
        detailsHtml += `
            <div class="group-map-links">
                <h4><i class="fas fa-external-link-alt"></i> 이 위치 전체보기</h4>
                <div class="map-buttons">
                    <button class="map-btn google-btn" onclick="openGoogleMaps('${firstPlace.name}', ${group.latitude}, ${group.longitude})">
                        <i class="fab fa-google"></i> 구글지도
                    </button>
                    <button class="map-btn amap-btn" onclick="openAmapSearch('${firstPlace.name}', ${group.latitude}, ${group.longitude})">
                        <i class="fas fa-map"></i> 가오더지도
                    </button>
                </div>
            </div>
        `;
    }

    L.popup({
        className: 'place-details-popup',
        maxWidth: 300,
        autoPan: true,
        autoPanPadding: L.point(10, 10),
        closeButton: true,
        closeOnClick: true
    })
    .setLatLng(marker.getLatLng())
    .setContent(detailsHtml)
    .openOn(map);
}

// 구글지도 열기 함수 (영문명으로 검색)
function openGoogleMaps(placeName, lat, lng) {
    const englishName = extractEnglishName(placeName);
    const encodedName = encodeURIComponent(englishName);
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodedName}`;
    window.open(googleMapsUrl, '_blank');
}

// 가오더지도 열기 함수 (중국어명으로 검색)
function openAmapSearch(placeName, lat, lng) {
    const chineseName = extractChineseName(placeName);
    const encodedName = encodeURIComponent(chineseName);
    const amapUrl = `https://ditu.amap.com/search?query=${encodedName}&city=上海&geoobj=${lng}|${lat}|${lng}|${lat}&zoom=17`;
    window.open(amapUrl, '_blank');
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
