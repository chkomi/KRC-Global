// Global Variables
let map;
let markers = L.featureGroup(); // This is not strictly used as a group, but rather markerGroups
let currentTileLayer;
let shanghaiData = null;
let allMarkers = []; // Array to store all marker data including label visibility
let currentLocationMarker = null; // Current location marker
let markerGroups = {
    attractions: L.featureGroup(),
    restaurants: L.featureGroup(),
    hotels: L.featureGroup(),
    airports: L.featureGroup()
};

// Map marker background colors for dynamic label border
const markerColors = {
    attractions: '#ea4335',
    restaurants: '#34a853',
    airports: '#9b59b6',
    hotels: '#1a73e8'
};


// Initialize on document load
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initializeMap();
    setupEventListeners();
});

// Function to load data
async function loadData() {
    try {
        const response = await fetch('data/shanghai-data.json');
        shanghaiData = await response.json();
        console.log('Data loaded successfully:', shanghaiData);
    } catch (error) {
        console.error('Failed to load data:', error);
        // Initialize with empty data on failure
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

// Function to extract Korean text
function extractKorean(text) {
    // Find Korean part within parentheses first
    const koreanInParentheses = text.match(/\(([가-힣\s]+)\)/);
    if (koreanInParentheses && koreanInParentheses[1].trim() !== '') {
        return koreanInParentheses[1].trim();
    }

    // If no parentheses or empty, extract Korean part from the whole text
    const koreanParts = text.match(/[가-힣\s]+/g);
    if (koreanParts && koreanParts.length > 0) {
        // Filter out empty strings and return the first non-empty Korean part
        const filteredParts = koreanParts.filter(part => part.trim() !== '');
        if (filteredParts.length > 0) {
            return filteredParts[0].trim();
        }
    }

    // Return original text if no Korean found
    return text;
}

// Map Initialization Function
function initializeMap() {
    // Initialize map (centered on Shanghai)
    map = L.map('map').setView([31.2304, 121.4737], 12);

    // Define different tile layers
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

    // Add default simple tile layer
    currentTileLayer = tileLayers.cartodb;
    currentTileLayer.addTo(map);

    // Tile layer change event listener
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

    // Add marker groups to the map
    Object.values(markerGroups).forEach(group => {
        group.addTo(map);
    });

    // Display markers
    displayMarkers();

    // Update label visibility on zoom end
    map.on('zoomend', () => {
        updateLabelVisibility();
    });
}

// Event Listener Setup
function setupEventListeners() {
    // Close info box with ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeInfoBox();
        }
    });

    // Close info box on map click (if not on a marker)
    map.on('click', (e) => {
        // Check if the click target is directly the map container, not a marker or popup
        if (e.originalEvent && e.originalEvent.target === map.getContainer()) {
            closeInfoBox();
        }
    });

    // Legend checkbox event listeners
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

    // Locate button event listener
    document.getElementById('locate-btn').addEventListener('click', function() {
        findMyLocation();
    });
}

// Toggle Marker Group Function
function toggleMarkerGroup(type, show) {
    if (show) {
        markerGroups[type].addTo(map);
    } else {
        map.removeLayer(markerGroups[type]);
    }

    // Ensure labels are updated after group visibility changes
    setTimeout(() => {
        updateLabelVisibility();
    }, 100);
}

// Display Markers Function
function displayMarkers() {
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('No data available to display markers.');
        return;
    }

    // Clear existing markers
    Object.values(markerGroups).forEach(group => {
        group.clearLayers();
    });
    allMarkers = [];

    // Combine all place data
    const allPlaces = [];
    const types = ['attractions', 'restaurants', 'hotels', 'airports'];

    types.forEach(type => {
        const places = shanghaiData.shanghai_tourism[type];
        places.forEach(place => {
            allPlaces.push({...place, type: type});
        });
    });

    // Group places by location
    const locationGroups = {};

    allPlaces.forEach(place => {
        // Use fixed precision for grouping to avoid floating point issues
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

    // Create a marker for each location group
    Object.values(locationGroups).forEach(group => {
        // Determine the main type for the icon based on a priority (e.g., airports > attractions > hotels > restaurants)
        const priorityOrder = { 'airports': 1, 'attractions': 2, 'hotels': 3, 'restaurants': 4 };
        const mainType = group.places.reduce((prev, curr) =>
            (priorityOrder[prev.type] < priorityOrder[curr.type] ? prev : curr)
        ).type;

        // Create marker
        const marker = L.marker([group.latitude, group.longitude], {
            icon: createCustomIcon(mainType)
        }).addTo(markerGroups[mainType]);

        // Generate label text (Korean only)
        let labelText;
        if (group.places.length === 1) {
            labelText = extractKorean(group.places[0].name);
        } else {
            const firstPlaceName = extractKorean(group.places[0].name);
            labelText = `${firstPlaceName} 외 ${group.places.length - 1}곳`;
        }

        // Click event to display group details
        marker.on('click', () => {
            displayGroupDetails(group);
            map.flyTo([group.latitude, group.longitude], 15); // Zoom in on click
        });

        // Bind tooltip (label) to the bottom of the marker
        const tooltip = marker.bindTooltip(labelText, {
            permanent: true,
            direction: 'bottom', // Place label to the bottom of the marker
            offset: [0, 15], // Adjust offset to move it slightly down from the marker center
            className: 'leaflet-tooltip', // Use the class for the new label design
            opacity: 1
        }).getTooltip();

        // Dynamically set the border-left color of the tooltip
        tooltip.getElement().style.borderLeft = `4px solid ${markerColors[mainType] || '#3498db'}`;


        // Store marker information for visibility control
        allMarkers.push({
            marker: marker,
            labelText: labelText,
            group: group,
            labelVisible: false,
            groupType: mainType
        });
    });

    // Adjust map view to fit all markers
    const allMarkersLayer = L.featureGroup();
    Object.values(markerGroups).forEach(group => {
        group.getLayers().forEach(layer => {
            allMarkersLayer.addLayer(layer);
        });
    });

    if (allMarkersLayer.getLayers().length > 0) {
        map.fitBounds(allMarkersLayer.getBounds().pad(0.1));
    }

    // Initial label visibility setup
    // A small delay ensures all elements are rendered before calculating visibility
    setTimeout(() => {
        updateLabelVisibility();
    }, 500);
}

// Find My Location Function
function findMyLocation() {
    const locateBtn = document.getElementById('locate-btn');
    const icon = locateBtn.querySelector('i');

    // Change to loading state
    icon.className = 'fas fa-spinner fa-spin';
    locateBtn.disabled = true;

    if (!navigator.geolocation) {
        alert('Location services are not supported by this browser.');
        resetLocateButton();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Move map to current location
            map.setView([lat, lng], 15);

            // Remove existing current location marker
            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
            }

            // Create current location marker
            currentLocationMarker = L.marker([lat, lng], {
                icon: createCurrentLocationIcon()
            }).addTo(map);

            const currentLocationTooltip = currentLocationMarker.bindTooltip('현재 위치', {
                permanent: false,
                direction: 'top',
                offset: [0, -25],
                className: 'leaflet-tooltip current-location-label' // Use the new label class
            }).openTooltip(); // Show tooltip immediately for current location

            // Set border color for current location label
            currentLocationTooltip.getElement().style.borderLeft = `4px solid #1a73e8`; // Example: blue border

            resetLocateButton();
        },
        function(error) {
            let errorMessage = 'Could not find your location.';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Location access denied.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information is unavailable.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out.';
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

// Reset Locate Button State
function resetLocateButton() {
    const locateBtn = document.getElementById('locate-btn');
    const icon = locateBtn.querySelector('i');

    icon.className = 'fas fa-location-crosshairs';
    locateBtn.disabled = false;
}

// Create Current Location Icon
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

// Update Label Visibility based on zoom and group visibility
function updateLabelVisibility() {
    const currentZoom = map.getZoom();

    // Determine the minimum zoom level at which labels should start appearing.
    // You'll need to adjust this value (e.g., 13, 14, or 15) based on your data density
    // and when you observe marker overlap.
    const minZoomForLabels = 14; // Labels visible at zoom 14 and higher

    allMarkers.forEach(markerData => {
        const isGroupVisible = map.hasLayer(markerGroups[markerData.groupType]);

        // Show labels only when zoom is at or above minZoomForLabels AND their group is visible
        if (currentZoom >= minZoomForLabels && isGroupVisible) {
            if (!markerData.labelVisible) {
                markerData.marker.openTooltip();
                markerData.labelVisible = true;
            }
        } else {
            // Hide labels
            if (markerData.labelVisible) {
                markerData.marker.closeTooltip();
                markerData.labelVisible = false;
            }
        }
    });
}

// Create Custom Icon (Circular Marker)
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
        iconSize: [24, 24], // Adjusted icon size
        iconAnchor: [12, 12] // Centered anchor
    });
}

// Display Group Details Function
function displayGroupDetails(group) {
    const infoBox = document.getElementById('place-details');
    const placeContent = document.getElementById('place-content');

    let detailsHtml = '';

    if (group.places.length === 1) {
        // Single place
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

        // Map links buttons
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
        // Group of places
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

            // Individual map links buttons
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

        // Group total map links buttons
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

// Open Google Maps Function (address-based)
function openGoogleMaps(address, lat, lng) {
    const encodedAddress = encodeURIComponent(address);
    // Standard Google Maps URL for searching by query (address) or lat/lng for a point.
    // Using a combined approach for better accuracy.
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress},${lat},${lng}`;
    window.open(googleMapsUrl, '_blank');
}

// Open Amap Function (address-based)
function openAmapSearch(address, lat, lng) {
    const encodedAddress = encodeURIComponent(address);
    // Amap URL for searching, including city and a precise lat/lng if available.
    const amapUrl = `https://ditu.amap.com/search?query=${encodedAddress}&city=上海&geoobj=${lng}|${lat}|${lng}|${lat}&zoom=17`;
    window.open(amapUrl, '_blank');
}

// Close Info Box Function
function closeInfoBox() {
    const infoBox = document.getElementById('place-details');
    infoBox.classList.remove('show');
}

// Return Type Icon Function
function getTypeIcon(type) {
    switch (type) {
        case 'attractions': return '📷';
        case 'restaurants': return '🍴';
        case 'airports': return '✈️';
        case 'hotels': return '🏨';
        default: return '📍';
    }
}

// Return Type Display Name Function (Korean)
function getTypeDisplayName(type) {
    switch (type) {
        case 'attractions': return '관광지';
        case 'restaurants': return '음식점';
        case 'airports': return '공항';
        case 'hotels': return '호텔';
        default: return '기타';
    }
}
