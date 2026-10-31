// --- State & Constants ---

const state = {
    city: 'London',
    lat: 51.5085,
    lon: -0.1257,
    unit: localStorage.getItem('weather_unit') || 'C',
    theme: localStorage.getItem('weather_theme') || 'dark',
    favorites: JSON.parse(localStorage.getItem('weather_favs')) || [],
    recent: JSON.parse(localStorage.getItem('weather_recent')) || []
};

let hourlyChartInstance = null; 


    const DOM = {
    searchInput: document.getElementById('search-input'),
    voiceBtn: document.getElementById('voice-btn'), // <-- ADD THIS LINE
    // ... keep the rest the same
    searchInput: document.getElementById('search-input'),
    locationBtn: document.getElementById('location-btn'),
    errorMsg: document.getElementById('error-message'),
    unitToggle: document.getElementById('unit-toggle'),
    themeToggle: document.getElementById('theme-toggle'),
    favBtn: document.getElementById('favorite-btn'),
    savedLocations: document.getElementById('saved-locations'),
    mainContent: document.getElementById('main-content'),
    body: document.body
};

// --- Initialization ---
function init() {
    applyTheme();
    DOM.unitToggle.innerText = `°${state.unit}`;
    
    if (state.recent.length > 0) {
        state.city = state.recent[0].city;
        state.lat = state.recent[0].lat;
        state.lon = state.recent[0].lon;
    }

    renderSavedLocations();
    fetchWeather(state.lat, state.lon, state.city);
    setupEventListeners();
    setInterval(updateGreetingAndLocalTime, 60000); 
}

function setupEventListeners() {
    DOM.searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });
    document.querySelector('.search-icon').addEventListener('click', handleSearch);
    DOM.locationBtn.addEventListener('click', handleGeolocation);
    DOM.unitToggle.addEventListener('click', toggleUnit);
    DOM.themeToggle.addEventListener('click', toggleTheme);
    DOM.favBtn.addEventListener('click', toggleFavorite);
    
    // Voice search click listener
    if (DOM.voiceBtn) {
        DOM.voiceBtn.addEventListener('click', handleVoiceSearch);
    }
}


// --- Theme & Unit Toggles ---
function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('weather_theme', state.theme);
    applyTheme();
    if(hourlyChartInstance) fetchWeather(state.lat, state.lon, state.city); 
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    DOM.themeToggle.innerHTML = state.theme === 'dark' ? '<i class="ph ph-sun"></i>' : '<i class="ph ph-moon"></i>';
}

function toggleUnit() {
    state.unit = state.unit === 'C' ? 'F' : 'C';
    localStorage.setItem('weather_unit', state.unit);
    DOM.unitToggle.innerText = `°${state.unit}`;
    fetchWeather(state.lat, state.lon, state.city);
}

// --- Search & Geocoding ---
async function handleSearch() {
    const query = DOM.searchInput.value.trim();
    if (!query) return;
    try {
        DOM.errorMsg.classList.add('hidden');
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
        const data = await res.json();
        if (!data.results || data.results.length === 0) throw new Error("City not found");
        
        const loc = data.results[0];
        const cityName = `${loc.name}${loc.admin1 ? ', ' + loc.admin1 : ''}`;
        saveRecentSearch(cityName, loc.latitude, loc.longitude);
        fetchWeather(loc.latitude, loc.longitude, cityName);
        DOM.searchInput.value = '';
    } catch (err) {
        DOM.errorMsg.classList.remove('hidden');
    }
}

function handleGeolocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                fetchWeather(position.coords.latitude, position.coords.longitude, "Current Location");
            },
            () => alert("Unable to retrieve your location.")
        );
    }
}

// --- Fetch Weather & AQI Concurrently ---
async function fetchWeather(lat, lon, cityName) {
    state.lat = lat; state.lon = lon; state.city = cityName;
    DOM.mainContent.classList.add('loading');
    updateFavButton();

    const tempUnit = state.unit === 'F' ? '&temperature_unit=fahrenheit' : '';
    
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto${tempUnit}`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`;

    try {
        const [weatherRes, aqiRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl)]);
        const weatherData = await weatherRes.json();
        const aqiData = await aqiRes.json();
        
        state.timezone = weatherData.timezone; 
        
        displayCurrentWeather(weatherData.current, cityName);
        generateSmartInsight(weatherData.current, weatherData.hourly, weatherData.daily);
        renderHourlyChart(weatherData.hourly);
        displayDailyForecast(weatherData.daily);
        displayAQI(aqiData.current);
        
        updateBackground(weatherData.current.weather_code, weatherData.current.is_day);
        updateGreetingAndLocalTime();

        setTimeout(() => DOM.mainContent.classList.remove('loading'), 300);
    } catch (err) {
        console.error("Error fetching data", err);
    }
}

// --- Smart Insights ---
function generateSmartInsight(current, hourly, daily) {
    const insightText = document.getElementById('insight-text');
    const rainProbNextFewHours = Math.max(...hourly.precipitation_probability.slice(0, 6));
    const uvMax = daily.uv_index_max[0];
    const temp = current.temperature_2m;
    
    let message = "Perfect conditions for outdoor activities!";
    
    if (rainProbNextFewHours > 50) message = "High chance of rain soon. Don't forget an umbrella! ☔";
    else if (current.weather_code >= 71 && current.weather_code <= 77) message = "Snowing! Drive safely and stay warm. ❄️";
    else if ((state.unit === 'C' && temp < 5) || (state.unit === 'F' && temp < 41)) message = "It's freezing out there. Bundle up! 🧣";
    else if ((state.unit === 'C' && temp > 30) || (state.unit === 'F' && temp > 86)) message = "Very hot today. Stay hydrated! 💧";
    else if (uvMax >= 7 && current.is_day) message = `UV Index is high (${uvMax}). Make sure to apply sunscreen! 🧴`;
    else if (current.weather_code === 0 && !current.is_day) message = "Clear skies tonight. Perfect for stargazing! 🔭";
    else if (current.wind_speed_10m > 30) message = "It's quite windy outside. Hold onto your hat! 🌬️";

    insightText.innerText = message;
}

// --- Chart.js Hourly Forecast ---
function renderHourlyChart(hourly) {
    const ctx = document.getElementById('hourly-chart').getContext('2d');
    const currentHourIndex = hourly.time.findIndex(t => new Date(t) >= new Date());
    const startIndex = currentHourIndex === -1 ? 0 : currentHourIndex;
    
    const labels = [];
    const temps = [];
    const rains = [];
    
    for (let i = startIndex; i < startIndex + 12; i++) {
        const date = new Date(hourly.time[i]);
        labels.push(i === startIndex ? 'Now' : date.toLocaleTimeString([], {hour: 'numeric'}));
        temps.push(Math.round(hourly.temperature_2m[i]));
        rains.push(hourly.precipitation_probability[i]);
    }

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
    const lineColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-line');

    if (hourlyChartInstance) hourlyChartInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, lineColor.trim() + '80');
    gradient.addColorStop(1, lineColor.trim() + '00'); 

    hourlyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Temperature`,
                data: temps,
                borderColor: lineColor,
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: lineColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                fill: true,
                tension: 0.4 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    padding: 10,
                    callbacks: { label: (context) => `${context.parsed.y}°${state.unit} (Rain: ${rains[context.dataIndex]}%)` }
                }
            },
            scales: {
                y: { display: false, min: Math.min(...temps) - 2, max: Math.max(...temps) + 2 },
                x: { grid: { display: false, drawBorder: false }, ticks: { color: textColor, font: { family: 'Inter', size: 12 } } }
            }
        }
    });
}

// --- Display Functions ---
function displayCurrentWeather(current, cityName) {
    document.getElementById('city-name').innerText = cityName;
    document.getElementById('current-temp').innerText = `${Math.round(current.temperature_2m)}°`;
    document.getElementById('feels-like').innerText = `Feels like ${Math.round(current.apparent_temperature)}°`;
    
    const weatherInfo = getWeatherInfo(current.weather_code, current.is_day);
    document.getElementById('weather-desc').innerText = weatherInfo.desc;
    document.getElementById('current-icon').className = weatherInfo.iconClass;

    document.getElementById('humidity').innerText = `${current.relative_humidity_2m}%`;
    document.getElementById('wind').innerText = `${current.wind_speed_10m} km/h`;
    document.getElementById('wind-dir').innerText = getWindDirection(current.wind_direction_10m);
    document.getElementById('visibility').innerText = `${(current.visibility / 1000).toFixed(1)} km`;
    
    const now = new Date();
    document.getElementById('last-updated').innerText = `Updated: ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
}

function displayDailyForecast(daily) {
    const container = document.getElementById('daily-container');
    container.innerHTML = '';
    
    document.getElementById('high-low').innerText = `H: ${Math.round(daily.temperature_2m_max[0])}° L: ${Math.round(daily.temperature_2m_min[0])}°`;
    
    const uvMax = daily.uv_index_max[0];
    document.getElementById('uv-index').innerText = uvMax.toFixed(1);
    let uvDesc = 'Low';
    if(uvMax >= 3 && uvMax < 6) uvDesc = 'Moderate';
    else if(uvMax >= 6 && uvMax < 8) uvDesc = 'High';
    else if(uvMax >= 8) uvDesc = 'Very High';
    document.getElementById('uv-desc').innerText = uvDesc;

    const formatTime = (iso) => new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    document.getElementById('sunrise').innerText = formatTime(daily.sunrise[0]);
    document.getElementById('sunset').innerText = formatTime(daily.sunset[0]);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(daily.time[i]);
        const dayName = i === 0 ? 'Today' : days[date.getDay()];
        const info = getWeatherInfo(daily.weather_code[i], 1); 

        const div = document.createElement('div');
        div.className = 'daily-item';
        div.innerHTML = `
            <div class="daily-day">${dayName}</div>
            <div class="daily-icon"><i class="${info.iconClass}"></i></div>
            <div class="daily-temps">
                <span class="temp-high">${Math.round(daily.temperature_2m_max[i])}°</span>
                <span class="temp-low">${Math.round(daily.temperature_2m_min[i])}°</span>
            </div>
        `;
        container.appendChild(div);
    }
}

function displayAQI(aqiCurrent) {
    if (!aqiCurrent) return;
    const aqi = aqiCurrent.us_aqi;
    document.getElementById('aqi-value').innerText = aqi;
    
    let desc = "Good";
    let color = "#22c55e"; 
    let percentage = (aqi / 300) * 100; 
    if(percentage > 100) percentage = 100;

    if (aqi > 50 && aqi <= 100) { desc = "Moderate"; color = "#eab308"; } 
    else if (aqi > 100 && aqi <= 150) { desc = "Unhealthy for Sensitive"; color = "#f97316"; } 
    else if (aqi > 150 && aqi <= 200) { desc = "Unhealthy"; color = "#ef4444"; } 
    else if (aqi > 200) { desc = "Hazardous"; color = "#a855f7"; } 

    document.getElementById('aqi-desc').innerText = desc;
    
    const bar = document.getElementById('aqi-bar');
    bar.style.width = `${percentage}%`;
    bar.style.background = color;
}

// --- Helpers & Utilities ---
function getWeatherInfo(code, isDay) {
    if (code === 0) return { desc: 'Clear sky', iconClass: isDay ? 'ph ph-sun' : 'ph ph-moon' };
    if (code >= 1 && code <= 3) return { desc: 'Partly cloudy', iconClass: 'ph ph-cloud' };
    if (code === 45 || code === 48) return { desc: 'Foggy', iconClass: 'ph ph-cloud-fog' };
    if (code >= 51 && code <= 67 || (code >= 80 && code <= 82)) return { desc: 'Rain', iconClass: 'ph ph-cloud-rain' };
    if (code >= 71 && code <= 77) return { desc: 'Snow', iconClass: 'ph ph-cloud-snow' };
    if (code >= 95 && code <= 99) return { desc: 'Thunderstorm', iconClass: 'ph ph-cloud-lightning' };
    return { desc: 'Unknown', iconClass: 'ph ph-cloud' };
}

function updateBackground(code, isDay) {
    let bgClass = 'weather-default';
    if (code === 0) bgClass = isDay ? 'weather-clear-day' : 'weather-clear-night';
    else if (code >= 1 && code <= 3) bgClass = 'weather-clouds';
    else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) bgClass = 'weather-rain';
    else if (code >= 71 && code <= 77) bgClass = 'weather-snow';
    else if (code >= 95 && code <= 99) bgClass = 'weather-thunder';
    DOM.body.className = bgClass;
}

function getWindDirection(degree) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(degree / 45) % 8];
}

function updateGreetingAndLocalTime() {
    if (!state.timezone) return;
    const options = { timeZone: state.timezone, hour: '2-digit', minute: '2-digit' };
    document.getElementById('local-time').innerText = `Local Time: ${new Intl.DateTimeFormat([], options).format(new Date())}`;

    const hour = new Date().getHours();
    let greeting = "Good evening";
    if (hour >= 5 && hour < 12) greeting = "Good morning";
    else if (hour >= 12 && hour < 18) greeting = "Good afternoon";
    document.getElementById('greeting-text').innerText = greeting;
}

// --- Favorites & Recents ---
function toggleFavorite() {
    const idx = state.favorites.findIndex(f => f.city === state.city);
    if (idx > -1) state.favorites.splice(idx, 1);
    else state.favorites.push({ city: state.city, lat: state.lat, lon: state.lon });
    localStorage.setItem('weather_favs', JSON.stringify(state.favorites));
    updateFavButton();
    renderSavedLocations();
}

function updateFavButton() {
    const isFav = state.favorites.some(f => f.city === state.city);
    DOM.favBtn.innerHTML = isFav ? '<i class="ph-fill ph-star" style="color: #fbbf24;"></i>' : '<i class="ph ph-star"></i>';
}

function saveRecentSearch(city, lat, lon) {
    state.recent = state.recent.filter(r => r.city !== city);
    state.recent.unshift({ city, lat, lon });
    if (state.recent.length > 3) state.recent.pop();
    localStorage.setItem('weather_recent', JSON.stringify(state.recent));
    renderSavedLocations();
}

function renderSavedLocations() {
    DOM.savedLocations.innerHTML = '';
    const displayList = [...state.favorites];
    state.recent.forEach(r => { if (!displayList.some(d => d.city === r.city)) displayList.push(r); });

    displayList.forEach(loc => {
        const isFav = state.favorites.some(f => f.city === loc.city);
        const pill = document.createElement('div');
        pill.className = 'pill';
        pill.innerHTML = `${isFav ? '<i class="ph-fill ph-star"></i>' : '<i class="ph ph-clock"></i>'} ${loc.city.split(',')[0]}`;
        pill.addEventListener('click', () => {
            fetchWeather(loc.lat, loc.lon, loc.city);
            DOM.searchInput.value = '';
        });
        DOM.savedLocations.appendChild(pill);
    });
}
// --- Voice Search (Web Speech API) ---
function handleVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        alert("Sorry, your browser does not support voice search.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Change icon to show it's listening
    DOM.voiceBtn.style.color = '#ef4444'; // Make mic red
    DOM.searchInput.placeholder = "Listening...";

    recognition.start();

    recognition.onresult = (event) => {
        const speechResult = event.results[0][0].transcript;
        DOM.searchInput.value = speechResult;
        handleSearch(); // Automatically trigger search
    };

    recognition.onspeechend = () => {
        recognition.stop();
    };

    recognition.onend = () => {
        // Reset icon and placeholder
        DOM.voiceBtn.style.color = 'var(--text-secondary)';
        DOM.searchInput.placeholder = "Search city...";
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        DOM.voiceBtn.style.color = 'var(--text-secondary)';
        DOM.searchInput.placeholder = "Search city...";
    };
}

init();

// --- Service Worker Registration for PWA ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then((registration) => { console.log('ServiceWorker registered with scope:', registration.scope); })
            .catch((error) => { console.log('ServiceWorker registration failed:', error); });
    });
}