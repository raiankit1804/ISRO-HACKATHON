// Utility functions
function showAlert(message, type = 'success') {
    const alertContainer = document.querySelector('.alert-container') || (() => {
        const div = document.createElement('div');
        div.className = 'alert-container';
        document.body.appendChild(div);
        return div;
    })();

    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    alertContainer.appendChild(alert);

    setTimeout(() => alert.remove(), 5000);
}

const createAlert = (message, type = 'info', duration = 5000) => {
    const alertContainer = document.querySelector('.alert-container');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} fade-in`;
    alert.textContent = message;
    
    alertContainer.appendChild(alert);
    
    setTimeout(() => {
        alert.classList.add('fade-out');
        setTimeout(() => alert.remove(), 300);
    }, duration);
};

// Handle file uploads for CSV imports
async function handleFileUpload(file, endpoint) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await axios.post(endpoint, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (response.data.success) {
            showAlert('File imported successfully');
            
            // After successful import, trigger placement if both containers and items are loaded
            const containersLoaded = await checkContainersExist();
            const itemsLoaded = await checkItemsExist();
            
            if (containersLoaded && itemsLoaded) {
                await triggerPlacement();
                await loadContainerVisualizations();
            }
            
            return response.data;
        } else {
            throw new Error(response.data.message || 'Import failed');
        }
    } catch (error) {
        showAlert(error.message, 'danger');
        throw error;
    }
}

async function checkContainersExist() {
    try {
        const response = await axios.get('/api/containers/check');
        return response.data.containersExist;
    } catch (error) {
        console.error('Error checking containers:', error);
        return false;
    }
}

async function checkItemsExist() {
    try {
        const response = await axios.get('/api/items/check');
        return response.data.itemsExist;
    } catch (error) {
        console.error('Error checking items:', error);
        return false;
    }
}

async function triggerPlacement() {
    try {
        const response = await axios.post('/api/placement/optimize');
        if (response.data.success) {
            showAlert('Items placed successfully');
            return true;
        }
        return false;
    } catch (error) {
        showAlert('Error placing items: ' + error.message, 'danger');
        return false;
    }
}

// Initialize drag and drop zones
document.addEventListener('DOMContentLoaded', () => {
    initializeDragAndDrop();
    initializeContainerVisualizations();
    initializeSimulationEffects();
    
    // Add hover effects to cards
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-5px)';
            card.style.boxShadow = '0 8px 20px rgba(0, 191, 255, 0.2)';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            card.style.boxShadow = '';
        });
    });

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Enhanced form submissions with loading states
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', e => {
            const submitButton = form.querySelector('[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = '<span class="loading-spinner"></span> Processing...';
            }
        });
    });

    // Enhance container visualization interactions
    const container = document.querySelector('.container-visualization');
    if (container) {
        container.addEventListener('mouseenter', () => {
            container.style.transform = 'scale(1.01)';
        });
        
        container.addEventListener('mouseleave', () => {
            container.style.transform = '';
        });
    }

    // Dynamic space utilization bars
    document.querySelectorAll('.space-utilization').forEach(bar => {
        const utilizationValue = parseFloat(bar.dataset.utilization || 0);
        const fill = bar.querySelector('.fill');
        if (fill) {
            setTimeout(() => {
                fill.style.width = `${utilizationValue}%`;
            }, 300);
        }
    });

    // Enhanced drag and drop zones
    document.querySelectorAll('.drag-drop-zone').forEach(zone => {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            zone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        zone.addEventListener('dragenter', () => zone.classList.add('dragover'));
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', () => zone.classList.remove('dragover'));
    });

    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const navbar = document.querySelector('.navbar');
    const navLinkItems = document.querySelectorAll('.nav-links li');

    // --- Hamburger Menu Toggle --- 
    hamburger?.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent document click from immediately closing
        navLinks.classList.toggle('active');
        hamburger.classList.toggle('active');
    });

    // --- Close Mobile Menu on Link Click --- 
    navLinkItems.forEach(link => {
        link.addEventListener('click', () => {
            if (navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                hamburger.classList.remove('active');
            }
        });
    });

    // --- Close Mobile Menu on Clicking Outside --- 
    document.addEventListener('click', (e) => {
        if (navLinks.classList.contains('active') && 
            !navLinks.contains(e.target) && 
            !hamburger.contains(e.target)) {
            navLinks.classList.remove('active');
            hamburger.classList.remove('active');
        }
    });

    // --- Navbar Scroll Animation --- 
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
    });

    // Add active state to current page link
    const currentPath = window.location.pathname;
    const navAnchors = document.querySelectorAll('.nav-links a');
    
    navAnchors.forEach(anchor => {
        if (anchor.getAttribute('href') === currentPath) {
            anchor.classList.add('active');
        }
    });
});

function initializeDragAndDrop() {
    const dropZones = document.querySelectorAll('.drag-drop-zone');
    
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const endpoint = zone.dataset.endpoint;
                handleFileUpload(files[0], endpoint);
            }
        });

        const input = zone.querySelector('input[type="file"]');
        zone.addEventListener('click', () => input.click());
        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0], zone.dataset.endpoint);
            }
        });
    });
}

// Enhanced container visualization
function initializeContainerVisualizations() {
    const containers = document.querySelectorAll('.container-visualization');
    containers.forEach(container => {
        initializeThreeJS(container);
        updateContainerVisualization(container);
    });
}

function initializeThreeJS(containerElement) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);  // Light gray background
    const camera = new THREE.PerspectiveCamera(75, containerElement.clientWidth / containerElement.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: false  // Disable alpha for better contrast
    });
    
    renderer.setSize(containerElement.clientWidth, containerElement.clientHeight);
    renderer.shadowMap.enabled = true;
    containerElement.appendChild(renderer.domElement);
    
    // Enhanced lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(5, 5, 5);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);
    
    // Store Three.js objects in the container element
    containerElement.threeData = { scene, camera, renderer };
    
    // Set initial camera position
    camera.position.set(200, 200, 200);
    camera.lookAt(0, 0, 0);
    
    // Add OrbitControls with enhanced settings
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 100;
    controls.maxDistance = 500;
    containerElement.threeData.controls = controls;
    
    // Start animation loop
    animate(containerElement);
}

function animate(containerElement) {
    const { scene, camera, renderer, controls } = containerElement.threeData;
    
    function render() {
        requestAnimationFrame(render);
        controls.update();
        renderer.render(scene, camera);
    }
    
    render();
}

async function updateContainerVisualization(containerElement) {
    const containerId = containerElement.dataset.containerId;
    const { scene } = containerElement.threeData;

    try {
        // Clear existing items
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }

        // Get container data
        const containerResponse = await axios.get(`/api/containers/${containerId}`);
        const container = containerResponse.data;

        // Create container mesh with improved visibility
        const containerGeometry = new THREE.BoxGeometry(container.width, container.height, container.depth);
        const containerMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x2196F3,  // Material blue color
            transparent: true,
            opacity: 0.15,
            wireframe: true,
            wireframeLinewidth: 2
        });
        const containerEdges = new THREE.EdgesGeometry(containerGeometry);
        const containerLine = new THREE.LineSegments(
            containerEdges,
            new THREE.LineBasicMaterial({ color: 0x0d47a1, linewidth: 2 })
        );
        
        const containerMesh = new THREE.Mesh(containerGeometry, containerMaterial);
        containerMesh.add(containerLine);
        scene.add(containerMesh);

        // Get items in container
        const itemsResponse = await axios.get(`/api/containers/${containerId}/items`);
        const items = itemsResponse.data;

        // Add items to scene with enhanced materials
        items.forEach(item => {
            if (
                item.width > container.width ||
                item.depth > container.depth ||
                item.height > container.height
            ) {
                console.warn(`Item ${item.itemId} exceeds container dimensions and will not be visualized.`);
                return;
            }

            const itemGeometry = new THREE.BoxGeometry(item.width, item.height, item.depth);
            const itemMaterial = new THREE.MeshPhongMaterial({ 
                color: getPriorityColor(item.priority),
                transparent: true,
                opacity: 0.85,
                shininess: 30,
                specular: 0x444444
            });
            const itemMesh = new THREE.Mesh(itemGeometry, itemMaterial);

            // Add edges to items for better visibility
            const edges = new THREE.EdgesGeometry(itemGeometry);
            const line = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 })
            );
            itemMesh.add(line);

            // Position item
            const position = item.position;
            itemMesh.position.set(
                position.startCoordinates.width + (item.width / 2),
                position.startCoordinates.height + (item.height / 2),
                position.startCoordinates.depth + (item.depth / 2)
            );

            // Add hover interaction
            itemMesh.userData = item;
            itemMesh.addEventListener('mouseover', onItemHover);

            scene.add(itemMesh);
        });

    } catch (error) {
        console.error('Error updating container visualization:', error);
    }
}

async function loadContainerVisualizations() {
    const containers = document.querySelectorAll('.container-visualization');
    for (const container of containers) {
        await updateContainerVisualization(container);
    }
}

function getPriorityColor(priority) {
    if (priority >= 90) return 0xff4444;      // Bright red for high priority
    if (priority >= 70) return 0xffaa00;      // Bright orange for medium priority
    return 0x4caf50;                          // Bright green for low priority
}

function onItemHover(event) {
    const item = event.target.userData;
    showItemTooltip(item);
}

// Simulation effects
function initializeSimulationEffects() {
    const simulationContainer = document.getElementById('simulationContainer');
    if (simulationContainer) {
        simulationContainer.classList.add('simulation-day');
    }
}

function simulateTimePassage(days) {
    return new Promise((resolve) => {
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        document.getElementById('simulationProgress').appendChild(progressBar);

        let currentDay = 0;
        const interval = setInterval(() => {
            if (currentDay >= days) {
                clearInterval(interval);
                progressBar.remove();
                resolve();
                return;
            }

            currentDay++;
            const progress = (currentDay / days) * 100;
            progressBar.style.width = `${progress}%`;
            
            // Trigger day/night cycle
            document.getElementById('simulationContainer').classList.toggle('simulation-day');
        }, 1000); // 1 second per day
    });
}

// Format dates consistently
function formatDate(dateString) {
    return new Date(dateString).toLocaleString();
}

// Calculate days until expiry
function getDaysUntilExpiry(expiryDate) {
    if (!expiryDate) return Infinity;
    const now = new Date();
    const expiry = new Date(expiryDate);
    return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}

// Generic data loading with template
async function loadData(endpoint, containerId, template) {
    try {
        const response = await axios.get(endpoint);
        const container = document.getElementById(containerId);
        if (container && response.data) {
            container.innerHTML = template(response.data);
        }
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

// Search functionality
async function handleSearch(query) {
    const searchType = document.querySelector('input[name="searchType"]:checked').value;
    const searchResults = document.getElementById('searchResults');
    
    if (!query.trim()) {
        searchResults.innerHTML = '';
        return;
    }

    try {
        const params = {};
        if (searchType === 'id') {
            params.itemId = query;
        } else {
            params.itemName = query;
        }

        const response = await axios.get('/api/search', { params });
        
        if (response.data.success && response.data.found) {
            const item = response.data.item;
            searchResults.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <h6 class="item-name">${item.name}</h6>
                        <p class="item-id">ID: ${item.itemId}</p>
                        <p class="item-location">Location: ${item.containerId} (${item.zone})</p>
                        <div class="d-flex justify-content-between align-items-center mt-3">
                            <button class="btn btn-primary btn-sm" onclick="showRetrievalSteps('${item.itemId}')">
                                View Retrieval Steps
                            </button>
                            <button class="btn btn-outline-primary btn-sm" onclick="showItemDetails('${item.itemId}')">
                                Full Details
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            searchResults.innerHTML = `
                <div class="alert alert-info">
                    No items found matching your search.
                </div>
            `;
        }
    } catch (error) {
        console.error('Search error:', error);
        showAlert('Error performing search: ' + error.message, 'danger');
    }
}

// Show retrieval steps
async function showRetrievalSteps(itemId) {
    const retrievalPanel = document.getElementById('retrievalInstructionsPanel');
    const retrievalSteps = document.getElementById('retrievalSteps');
    
    try {
        const response = await axios.get('/api/search', { params: { itemId } });
        
        if (response.data.success && response.data.found) {
            const steps = response.data.retrievalSteps;
            retrievalSteps.innerHTML = `
                <div class="list-group">
                    ${steps.map(step => `
                        <div class="list-group-item ${step.action.toLowerCase()}">
                            <div class="d-flex justify-content-between align-items-center">
                                <span>
                                    <strong>Step ${step.step}:</strong> 
                                    ${step.action} ${step.itemName || step.itemId}
                                </span>
                                <span class="badge bg-primary">${step.action}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="mt-3">
                    <button class="btn btn-primary w-100" onclick="confirmRetrieval('${itemId}')">
                        Confirm Retrieval
                    </button>
                </div>
            `;
            retrievalPanel.style.display = 'block';
        }
    } catch (error) {
        console.error('Error showing retrieval steps:', error);
        showAlert('Error loading retrieval steps: ' + error.message, 'danger');
    }
}

// Confirm retrieval
async function confirmRetrieval(itemId) {
    try {
        const response = await axios.post('/api/retrieve', {
            itemId,
            userId: 'current-user', // Replace with actual user ID from session
            timestamp: new Date().toISOString()
        });
        
        if (response.data.success) {
            showAlert('Item retrieved successfully');
            // Show container selection modal for placing the item back
            const modal = new bootstrap.Modal(document.getElementById('newContainerModal'));
            modal.show();
            
            // Store the current item ID for use in placement
            document.getElementById('newContainerModal').dataset.itemId = itemId;
        }
    } catch (error) {
        console.error('Error confirming retrieval:', error);
        showAlert('Error confirming retrieval: ' + error.message, 'danger');
    }
}

// Submit new container placement
async function submitNewContainer() {
    const modal = document.getElementById('newContainerModal');
    const itemId = modal.dataset.itemId;
    const containerId = document.getElementById('newContainerId').value;
    const posX = document.getElementById('posX').value || 0;
    const posY = document.getElementById('posY').value || 0;
    const posZ = document.getElementById('posZ').value || 0;
    
    try {
        const response = await axios.post('/api/place', {
            itemId,
            userId: 'current-user', // Replace with actual user ID from session
            timestamp: new Date().toISOString(),
            containerId,
            position: {
                startCoordinates: {
                    width: parseInt(posX),
                    depth: parseInt(posY),
                    height: parseInt(posZ)
                },
                endCoordinates: {
                    width: parseInt(posX) + 10, // Assuming item dimensions, replace with actual
                    depth: parseInt(posY) + 10,
                    height: parseInt(posZ) + 10
                }
            }
        });
        
        if (response.data.success) {
            showAlert('Item placed successfully');
            bootstrap.Modal.getInstance(modal).hide();
            // Refresh container visualizations
            await loadContainerVisualizations();
        }
    } catch (error) {
        console.error('Error placing item:', error);
        showAlert('Error placing item: ' + error.message, 'danger');
    }
}

// Show item details
async function showItemDetails(itemId) {
    const detailsPanel = document.getElementById('itemDetailsPanel');
    const details = document.getElementById('itemDetails');
    
    try {
        const response = await axios.get('/api/search', { params: { itemId } });
        
        if (response.data.success && response.data.found) {
            const item = response.data.item;
            details.innerHTML = `
                <div class="mb-3">
                    <h6 class="mb-2">Item Information</h6>
                    <p><strong>Name:</strong> ${item.name}</p>
                    <p><strong>ID:</strong> ${item.itemId}</p>
                    <p><strong>Location:</strong> ${item.containerId} (${item.zone})</p>
                    <p><strong>Position:</strong> (${item.position.startCoordinates.width}, 
                        ${item.position.startCoordinates.depth}, 
                        ${item.position.startCoordinates.height})</p>
                </div>
            `;
            detailsPanel.style.display = 'block';
        }
    } catch (error) {
        console.error('Error showing item details:', error);
        showAlert('Error loading item details: ' + error.message, 'danger');
    }
}

// Debounced search handler
const debouncedSearch = debounce(handleSearch, 300);

// Enhanced API interactions
const api = {
    async get(endpoint) {
        try {
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            createAlert(error.message, 'danger');
            throw error;
        }
    },

    async post(endpoint, data) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            createAlert(error.message, 'danger');
            throw error;
        }
    }
};

// Export for use in other scripts
window.api = api;
window.createAlert = createAlert;