document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
});

let map;
let markers = L.featureGroup(); // 마커들을 관리할 레이어 그룹

function initializeMap() {
    // 지도 초기화: 상해의 대략적인 중심 좌표
    map = L.map('map').setView([31.2304, 121.4737], 12); // 상해 중심 좌표 및 초기 줌 레벨

    // OpenStreetMap 타일 레이어 추가
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // 마커 레이어 그룹을 지도에 추가
    markers.addTo(map);

    // 데이터 로드
    loadShanghaiData();
}

async function loadShanghaiData() {
    try {
        // 업데이트된 JSON 파일 경로
        const response = await fetch('./data/shanghai_trip_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('상해 데이터 로드 성공:', data); // 디버깅용
        displayMarkers(data.places); // JSON 구조에 맞게 'places' 배열 사용
    } catch (error) {
        console.error('상해 데이터 로드 실패:', error);
        document.getElementById('place-details').innerHTML = '<p style="color: red;">데이터 로드에 실패했습니다. 파일을 확인해주세요.</p>';
    }
}

function displayMarkers(places) {
    markers.clearLayers(); // 기존 마커 모두 제거

    const placeDetailsPanel = document.getElementById('place-details');

    places.forEach(place => {
        const marker = L.marker([place.latitude, place.longitude], {
            icon: createCustomIcon(place.type)
        }).addTo(markers);

        // 마커에 팝업 대신 툴팁(Label)을 추가하여 항상 표시되도록 설정 (옵션)
        // .openTooltip()을 사용하지 않으면 마우스 오버 시에만 나타남
        marker.bindTooltip(place.name, {
            permanent: false, // 마우스 오버 시에만 표시 (true로 하면 항상 표시)
            direction: 'top', // 툴팁 위치
            offset: [0, -10] // 툴팁 위치 조정
        });

        marker.on('click', () => {
            let detailsHtml = `<h3>${place.name}</h3>`;
            detailsHtml += `<p><strong>종류:</strong> ${place.type}</p>`;
            detailsHtml += `<p><strong>주요 특징:</strong> ${place.feature || '정보 없음'}</p>`;
            if (place.주소) detailsHtml += `<p><strong>주소:</strong> ${place.주소}</p>`;
            if (place.추천_방문일차) detailsHtml += `<p><strong>추천 방문 일차:</strong> ${place.추천_방문일차}</p>`;
            if (place.평점) detailsHtml += `<p><strong>평점:</strong> ${place.평점} / 5</p>`;
            if (place.영업시간) detailsHtml += `<p><strong>영업 시간:</strong> ${place.영업시간}</p>`;
            if (place.전화번호) detailsHtml += `<p><strong>전화번호:</strong> ${place.전화번호}</p>`;

            placeDetailsPanel.innerHTML = detailsHtml;
            map.flyTo([place.latitude, place.longitude], 14); // 클릭 시 해당 마커로 이동 및 줌
        });
    });

    // 모든 마커가 보이도록 지도 뷰 조정
    if (markers.getLayers().length > 0) {
        map.fitBounds(markers.getBounds().pad(0.1)); // 모든 마커가 보이도록 지도 범위 조정, 여백 추가
    }
}

// 사용자 정의 마커 아이콘 생성 함수
function createCustomIcon(type) {
    let markerColor;
    let borderColor = 'white'; // 기본 테두리 색상
    let borderWidth = '2px'; // 기본 테두리 두께

    switch (type) {
        case '관광지':
            markerColor = 'white'; // 관광지: 흰색 배경
            borderColor = 'tomato'; // 붉은색 테두리
            break;
        case '음식점':
            markerColor = 'mediumseagreen'; // 음식점: 녹색 계열
            break;
        case 'airport':
            markerColor = 'rebeccapurple'; // 공항: 보라색 계열
            break;
        case 'accommodation':
            markerColor = 'royalblue'; // 숙소: 파란색 계열
            break;
        default:
            markerColor = '#3498db'; // 기본: 파랑
    }

    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: ${markerColor}; width: 25px; height: 25px; border-radius: 50%; border: ${borderWidth} solid ${borderColor}; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
        iconSize: [25, 25],
        iconAnchor: [12, 12], // 아이콘의 중심이 좌표에 오도록 조정
        tooltipAnchor: [0, -10] // 툴팁 위치 조정
    });
}
