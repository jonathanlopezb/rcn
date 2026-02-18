console.log("🚀 main.js: Iniciando carga de módulos...");

import * as THREE from 'three';
import mpPose from '@mediapipe/pose';
import mpCamera from '@mediapipe/camera_utils';
import QRCode from 'qrcode';
import gsap from 'gsap';

// Solución para compatibilidad de constructores en Vite/NPM
const Pose = mpPose.Pose || window.Pose;
const Camera = mpCamera.Camera || window.Camera;

console.log("✅ main.js: Módulos cargados correctamente.");

class SprintGame {
    constructor() {
        console.log("🏗️ SprintGame: Instanciando clase...");
        this.gameState = 'IDLE';
        this.distance = 1000;
        this.time = 0;
        this.power = 0;
        this.maxPower = 0;
        this.timerInterval = null;
        this.npcPowers = [0, 0];
        this.positions = ['TÚ', 'NPC 1', 'NPC 2'];
        this.playerName = "COloca tu nombre aqui";

        // MediaPipe Pose
        this.pose = null;
        this.cameraMP = null; // MediaPipe Camera
        this.lastWristY = null;
        this.movementThreshold = 0.04;

        // Three.js Properties
        this.scene = null;
        this.camera3D = null;
        this.renderer = null;
        this.road = null;
        this.roadTexture = null;
        this.clock = new THREE.Clock();

        // Biomecánica & Detección avanzada
        this.angleBuffer = [];
        this.pedalCount = 0;
        this.pedalState = 'UP'; // UP o DOWN
        this.lastPedalTime = 0;
        this.rpm = 0;
        this.inertia = 0;
        this.resistance = 0.05; // Coeficiente de resistencia al aire

        this.initDOM();
        this.initEvents(); // PRIMERO: Los eventos tienen que estar listos ya mismo.

        try {
            console.log("🎨 Three.js: Inicializando escena...");
            this.initThree();
            console.log("🎙️ Narrador: Inicializando voces...");
            this.initNarrator();
        } catch (e) {
            console.error("⚠️ Error en componentes visuales/audio:", e);
            this.showError("Error al inicializar 3D: " + e.message);
        }
    }

    showError(msg) {
        let errorDiv = document.getElementById('debug-log');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'debug-log';
            errorDiv.style.position = 'absolute';
            errorDiv.style.top = '10px';
            errorDiv.style.left = '50%';
            errorDiv.style.transform = 'translateX(-50%)';
            errorDiv.style.background = 'rgba(255,0,0,0.8)';
            errorDiv.style.color = 'white';
            errorDiv.style.padding = '10px';
            errorDiv.style.zIndex = '10000';
            errorDiv.style.fontSize = '12px';
            errorDiv.style.borderRadius = '5px';
            document.body.appendChild(errorDiv);
        }
        errorDiv.innerText = msg;
    }

    initThree() {
        const container = this.elements.threeContainer;
        if (!container) return;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Cielo inicial

        // Fog para profundidad
        this.scene.fog = new THREE.Fog(0x87ceeb, 20, 300);

        this.camera3D = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

        // Renderer
        try {
            console.log("🚀 Three.js: Creando WebGLRenderer...");
            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: false, // Quitar alpha para asegurar que el fondo del scene se vea
                powerPreference: "high-performance"
            });
            this.renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(this.renderer.domElement);
            this.updateRendererSize();
            console.log("✅ Three.js: Renderer acoplado al DOM.");
        } catch (err) {
            console.error("💥 Three.js: WebGL no disponible:", err);
            this.showError("WebGL no disponible o error: " + err.message);
            return;
        }

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(5, 10, 7.5);
        this.scene.add(sunLight);

        // Grid para saber que el 3D vive
        const grid = new THREE.GridHelper(200, 50, 0xff0000, 0x444444);
        this.scene.add(grid);

        // Road con líneas (Mejorado para WOW)
        const roadGroup = new THREE.Group();
        const roadGeo = new THREE.PlaneGeometry(25, 4000);
        const roadMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
        this.road = new THREE.Mesh(roadGeo, roadMat);
        this.road.rotation.x = -Math.PI / 2;
        this.road.position.z = -1000;
        roadGroup.add(this.road);

        // Líneas de carretera
        for (let i = 0; i < 100; i++) {
            const lineGeo = new THREE.PlaneGeometry(0.3, 10);
            const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(0, 0.05, -i * 40);
            roadGroup.add(line);
        }
        this.scene.add(roadGroup);

        // Skybox (Esfera gigante)
        const skyGeo = new THREE.SphereGeometry(1000, 32, 32);
        const skyMat = new THREE.MeshBasicMaterial({
            color: 0x87ceeb,
            side: THREE.BackSide
        });
        this.sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.sky);

        // Ciclista
        this.cyclistGroup = new THREE.Group();
        const bikeGeo = new THREE.BoxGeometry(0.5, 0.5, 1.2);
        const bikeMat = new THREE.MeshBasicMaterial({ color: 0xe30613 });
        this.cyclistGroup.add(new THREE.Mesh(bikeGeo, bikeMat));

        const riderGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.8);
        const riderMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const rider = new THREE.Mesh(riderGeo, riderMat);
        rider.position.y = 0.6;
        this.cyclistGroup.add(rider);

        this.scene.add(this.cyclistGroup);

        // Montañas (Parallax)
        this.mountains = new THREE.Group();
        for (let i = 0; i < 20; i++) {
            const mGeo = new THREE.ConeGeometry(5 + Math.random() * 10, 10 + Math.random() * 20, 4);
            const mMat = new THREE.MeshBasicMaterial({ color: 0x3d2b1f });
            const mesh = new THREE.Mesh(mGeo, mMat);
            mesh.position.set(
                (Math.random() - 0.5) * 200,
                0,
                -Math.random() * 2000
            );
            this.mountains.add(mesh);
        }
        this.scene.add(this.mountains);

        // NPCs
        this.npcMeshes = [];
        for (let i = 0; i < 2; i++) {
            const npc = new THREE.Group();
            const nBike = new THREE.Mesh(bikeGeo, new THREE.MeshBasicMaterial({ color: 0x0033a0 }));
            npc.add(nBike);
            npc.position.set(i === 0 ? -2 : 2, 0, -5);
            this.npcMeshes.push(npc);
            this.scene.add(npc);
        }

        // Camera setup
        this.camera3D.position.set(0, 3, 8);
        this.camera3D.lookAt(0, 1, 0);

        // Animación
        this.animate();
    }

    updateRendererSize() {
        const container = this.elements.threeContainer;
        if (!container || !this.renderer) return;
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        this.renderer.setSize(width, height);
        this.camera3D.aspect = width / height;
        this.camera3D.updateProjectionMatrix();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        const powerFactor = this.power / 1500;
        const speed = (this.power / 5) + 5;

        if (this.gameState === 'SPRINTING') {
            // Mover carretera
            if (this.road.material.map) {
                this.road.material.map.offset.y += powerFactor * delta * 5;
            }

            // Mover montañas (Parallax)
            this.mountains.children.forEach(m => {
                m.position.z += speed * delta;
                if (m.position.z > 100) m.position.z = -2000;
            });

            // Mover NPCs
            this.npcMeshes.forEach((npc, i) => {
                const npcPower = this.npcPowers[i];
                const relativeSpeed = (this.power - npcPower) / 50;
                npc.position.z += relativeSpeed * delta;
                npc.position.x += Math.sin(Date.now() * 0.002 + i) * 0.02;
            });

            // Animación Jugador
            this.cyclistGroup.rotation.z = Math.sin(Date.now() * 0.01) * 0.05 * powerFactor;
            this.cyclistGroup.position.y = Math.abs(Math.sin(Date.now() * 0.01)) * 0.05;

            // Cámara Cinematográfica
            const targetZ = 12 - (powerFactor * 5);
            const targetY = 3 + (powerFactor * 1.5);
            this.camera3D.position.z += (targetZ - this.camera3D.position.z) * 0.1;
            this.camera3D.position.y += (targetY - this.camera3D.position.y) * 0.1;

            if (this.power > 900) {
                this.camera3D.position.x = (Math.random() - 0.5) * 0.2;
            } else {
                this.camera3D.position.x = 0;
            }

            this.camera3D.lookAt(0, 1, -10);
        }

        if (this.renderer) this.renderer.render(this.scene, this.camera3D);
    }

    initPose() {
        this.pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.pose.onResults((results) => this.onPoseResults(results));

        this.cameraMP = new Camera(this.elements.video, {
            onFrame: async () => {
                await this.pose.send({ image: this.elements.video });
            },
            width: 640,
            height: 480
        });
        this.cameraMP.start();
    }

    onPoseResults(results) {
        if (!results.poseLandmarks) return;

        // Visualización MediaPipe
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        this.ctx.drawImage(results.image, 0, 0, this.elements.canvas.width, this.elements.canvas.height);

        const wristR = results.poseLandmarks[16];
        const wristL = results.poseLandmarks[15];
        if (!wristR || !wristL) return;

        const currentY = (wristR.y + wristL.y) / 2;

        // --- SISTEMA PRECISIÓN BIOMECÁNICA ---
        const hip = results.poseLandmarks[24]; // Cadera derecha
        const knee = results.poseLandmarks[26]; // Rodilla derecha
        const ankle = results.poseLandmarks[28]; // Tobillo derecho

        if (hip && knee && ankle) {
            const angle = this.calculateAngle(hip, knee, ankle);
            this.processAngle(angle);
        }

        this.lastWristY = currentY;
        this.ctx.restore();
    }

    calculateAngle(a, b, c) {
        // b es el vértice (rodilla)
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        if (angle > 180.0) angle = 360 - angle;
        return angle;
    }

    processAngle(rawAngle) {
        // 1. Suavizado (Promedio móvil de 7 frames)
        this.angleBuffer.push(rawAngle);
        if (this.angleBuffer.length > 7) this.angleBuffer.shift();
        const avgAngle = this.angleBuffer.reduce((a, b) => a + b) / this.angleBuffer.length;

        // 2. Máquina de estados (Detección de ciclo)
        const indicator = document.getElementById('detection-indicator');

        // Detección FLEXIÓN (Arriba)
        if (avgAngle < 80 && this.pedalState === 'UP') {
            this.pedalState = 'DOWN';
            if (indicator) indicator.classList.add('active');
        }

        // Detección EXTENSIÓN (Abajo)
        if (avgAngle > 140 && this.pedalState === 'DOWN') {
            this.pedalState = 'UP';
            this.countPedal();
            if (indicator) indicator.classList.remove('active');
        }
    }

    countPedal() {
        const now = performance.now();
        if (this.lastPedalTime > 0) {
            const timeDiff = (now - this.lastPedalTime) / 1000; // Segundos
            if (timeDiff > 0.3) { // Debounce mínimo para evitar ruido
                this.rpm = 60 / timeDiff;
                if (this.rpm > 140) this.rpm = 140; // Límite realista

                // Inyección de energía proporcional a la fuerza del pedalazo (distancia recorrida en el ángulo)
                this.inertia += 40;
                this.power = this.inertia * 5; // Simulación de watts
            }
        }
        this.lastPedalTime = now;
        this.pedalCount++;
    }

    initNarrator() {
        this.synth = window.speechSynthesis;
        this.narratorVoice = null;
        const loadVoices = () => {
            const voices = this.synth.getVoices();
            this.narratorVoice = voices.find(v => v.lang.includes('es-CO')) ||
                voices.find(v => v.lang.includes('es-ES')) ||
                voices[0];
        };
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = loadVoices;
        }
        loadVoices();
    }

    speak(text, priority = false) {
        if (!this.synth || !this.narratorVoice) return;
        if (priority) this.synth.cancel();
        if (this.synth.speaking && !priority) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.narratorVoice;
        utterance.rate = 1.1;
        this.synth.speak(utterance);
    }

    initAudio() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    playCrowdSound() {
        if (!this.audioCtx) return;
        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        oscillator.type = 'brown';
        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        gainNode.gain.setValueAtTime(0.01, this.audioCtx.currentTime);
        oscillator.start();
        this.crowdSound = { oscillator, gainNode };
    }

    increaseCrowdVolume(volume) {
        if (this.crowdSound) {
            this.crowdSound.gainNode.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.5);
        }
    }

    stopCrowdSound() {
        if (this.crowdSound) {
            this.crowdSound.oscillator.stop();
        }
    }

    initDOM() {
        this.elements = {
            threeContainer: document.getElementById('three-container'),
            startOverlay: document.getElementById('start-overlay'),
            countdownOverlay: document.getElementById('countdown-overlay'),
            resultOverlay: document.getElementById('result-overlay'),
            startBtn: document.getElementById('start-btn'),
            restartBtn: document.getElementById('restart-btn'),
            timer: document.getElementById('timer'),
            distance: document.getElementById('distance'),
            powerFill: document.getElementById('power-fill'),
            powerText: document.getElementById('power-text'),
            resTime: document.getElementById('res-time'),
            resPower: document.getElementById('res-power'),
            video: document.getElementById('input-video'),
            canvas: document.getElementById('output-canvas'),
            countdownText: document.getElementById('countdown-text')
        };
        this.ctx = this.elements.canvas.getContext('2d');
    }

    initEvents() {
        console.log("Inicializando eventos...");
        if (!this.elements.startBtn) {
            console.error("BOTÓN DE INICIO NO ENCONTRADO EN EL DOM");
            return;
        }

        this.elements.startBtn.addEventListener('click', () => {
            console.log("Click en Comenzar detectado");
            this.startCountdown();
        });
        this.elements.restartBtn.addEventListener('click', () => this.reset());

        const withdrawBtn = document.getElementById('withdraw-btn');
        if (withdrawBtn) {
            withdrawBtn.addEventListener('click', () => {
                this.speak("¡Te has retirado de la carrera!", true);
                this.reset();
            });
        }

        this.elements.fullscreenBtn = document.getElementById('fullscreen-btn');
        if (this.elements.fullscreenBtn) {
            this.elements.fullscreenBtn.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                } else {
                    document.exitFullscreen();
                }
            });
        }

        window.addEventListener('resize', () => this.updateRendererSize());
    }

    startCountdown() {
        const nameInput = document.getElementById('player-name');
        const errorMsg = document.getElementById('name-error');
        this.playerName = nameInput ? nameInput.value.trim() : "";

        if (!this.playerName) {
            if (errorMsg) errorMsg.style.display = 'block';
            this.speak("El nombre es obligatorio", true);
            return;
        }

        if (errorMsg) errorMsg.style.display = 'none';
        this.gameState = 'COUNTDOWN';

        // Inicializar Audio y Pose solo después de interacción del usuario
        if (!this.audioCtx) this.initAudio();
        if (!this.pose) this.initPose();

        this.elements.startOverlay.classList.remove('active');
        this.elements.countdownOverlay.classList.add('active');

        let count = 3;
        this.elements.countdownText.innerText = count;
        this.speak(count.toString(), true);

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                this.elements.countdownText.innerText = count;
                this.speak(count.toString(), true);
            } else {
                this.elements.countdownText.innerText = "¡YA!";
                this.speak(`¡Arranca el sprint para ${this.playerName}!`, true);
                clearInterval(interval);
                setTimeout(() => this.startSprint(), 800);
            }
        }, 1000);
    }

    startSprint() {
        this.gameState = 'SPRINTING';
        this.elements.countdownOverlay.classList.remove('active');
        this.playCrowdSound();
        this.increaseCrowdVolume(0.05);

        this.timerInterval = setInterval(() => {
            this.update();
        }, 100);
    }

    update() {
        this.time += 0.1;

        this.npcPowers = this.npcPowers.map(p => Math.max(200, p + (Math.random() - 0.5) * 40));

        // --- SISTEMA DE FÍSICA E INERCIA ---
        // Resistencia aerodinámica (más difícil a más velocidad)
        const resistanceFactor = 0.002 * Math.pow(this.inertia, 2);
        this.inertia -= (0.5 + resistanceFactor); // Fricción base + aire
        if (this.inertia < 0) this.inertia = 0;

        this.power = this.inertia * 8; // Escalamiento de Watts
        if (this.power > 1800) this.power = 1800;

        // Actualizar RPM (Decaimiento natural si no pedalea)
        if (performance.now() - this.lastPedalTime > 2000) {
            this.rpm *= 0.9;
            if (this.rpm < 5) this.rpm = 0;
        }

        // Avance basado en inercia
        if (this.inertia > 1) {
            const speed = (this.inertia / 2) + 10;
            this.distance -= speed * 0.1;
        }

        if (this.distance < 300) this.increaseCrowdVolume(0.15);

        // Narración
        if (Math.ceil(this.distance) === 800) this.speak(`¡Atención que ${this.playerName} está bien ubicado!`);
        if (Math.ceil(this.distance) === 500) this.speak("¡Medio kilómetro para la gloria!");
        if (Math.ceil(this.distance) === 200) this.speak("¡Doscientos metros! ¡Dale con todo!");

        if (this.distance <= 0) {
            this.distance = 0;
            this.finish();
        }

        this.calculatePostions();
        this.updateHUD();
    }

    calculatePostions() {
        const scores = [
            { name: 'TÚ', power: this.power },
            { name: 'NPC 1', power: this.npcPowers[0] },
            { name: 'NPC 2', power: this.npcPowers[1] }
        ].sort((a, b) => b.power - a.power);
        this.positions = scores.map(s => s.name);
    }

    updateHUD() {
        const mins = Math.floor(this.time / 60);
        const secs = Math.floor(this.time % 60);
        const ms = Math.floor((this.time % 1) * 100);
        this.elements.timer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
        this.elements.distance.innerText = `${Math.ceil(this.distance)}m`;

        const percent = (this.power / 1500) * 100;
        this.elements.powerFill.style.width = `${percent}%`;
        this.elements.powerText.innerText = `${Math.floor(this.power)}W`;

        const rpmEl = document.getElementById('rpm');
        if (rpmEl) rpmEl.innerText = Math.floor(this.rpm);

        this.positions.forEach((name, index) => {
            const el = document.getElementById(`rank-${index + 1}`);
            if (el) {
                el.innerHTML = `${index + 1}º <span class="name">${name}</span>`;
                el.classList.toggle('active', name === 'TÚ');
            }
        });
    }

    async generateQR() {
        const qrContainer = document.getElementById('qrcode');
        const finalRank = this.positions.indexOf('TÚ') + 1;
        const resultText = `¡Desafío RCN! ${this.playerName} alcanzó la posición ${finalRank} con ${Math.floor(this.maxPower)}W. By Transelo Eventos.`;
        try {
            const qrDataUrl = await QRCode.toDataURL(resultText, { width: 150 });
            qrContainer.innerHTML = `<img src="${qrDataUrl}" alt="QR Resultado">`;
        } catch (err) { console.error(err); }
    }

    finish() {
        this.gameState = 'FINISHED';
        clearInterval(this.timerInterval);
        this.increaseCrowdVolume(0.01);
        setTimeout(() => this.stopCrowdSound(), 2000);

        const finalRank = this.positions.indexOf('TÚ') + 1;
        this.speak(`${this.playerName} cruza en posición ${finalRank}.`, true);

        document.getElementById('final-rank-text').innerText = `¡${finalRank}º POSICIÓN!`;
        this.elements.resTime.innerText = this.elements.timer.innerText;
        this.elements.resPower.innerText = `${Math.floor(this.maxPower)}W`;
        this.elements.resultOverlay.classList.add('active');
        this.generateQR();
    }

    reset() {
        window.location.reload(); // Simplificado para Three.js reset
    }
}

try {
    console.log("🏁 main.js: Intentando arrancar el juego...");
    const game = new SprintGame();
    window.game = game; // Para debug desde consola
} catch (err) {
    console.error("💥 ERROR CRÍTICO AL ARRANCAR EL JUEGO:", err);
    alert("Hubo un error cargando el juego. Por favor, mira la consola (F12) para más detalles.");
}
