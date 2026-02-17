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
        this.playerName = "Jonathan";

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

        this.initDOM();
        this.initEvents(); // PRIMERO: Los eventos tienen que estar listos ya mismo.

        try {
            console.log("🎨 Three.js: Inicializando escena...");
            this.initThree();
            console.log("🎙️ Narrador: Inicializando voces...");
            this.initNarrator();
        } catch (e) {
            console.error("⚠️ Error en componentes visuales/audio:", e);
        }
    }

    initThree() {
        const container = this.elements.threeContainer;
        if (!container) {
            console.warn("Contenedor 3D no encontrado.");
            return;
        }

        // Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Cielo azul
        this.scene.fog = new THREE.Fog(0x87ceeb, 10, 100);

        this.camera3D = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera3D.position.set(0, 1.6, 5); // Vista desde atrás del ciclista

        // Renderer
        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(this.renderer.domElement);
        } catch (err) {
            console.error("WebGL no disponible:", err);
            return;
        }

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(5, 10, 7.5);
        this.scene.add(sunLight);

        // Road
        const loader = new THREE.TextureLoader();
        this.roadTexture = loader.load('https://threejs.org/examples/textures/floors/FloorsCheckerboard_S_Diffuse.jpg'); // Placeholder realista
        this.roadTexture.wrapS = THREE.RepeatWrapping;
        this.roadTexture.wrapT = THREE.RepeatWrapping;
        this.roadTexture.repeat.set(1, 10);

        const roadGeo = new THREE.PlaneGeometry(10, 1000);
        const roadMat = new THREE.MeshStandardMaterial({
            map: this.roadTexture,
            color: 0x333333
        });
        this.road = new THREE.Mesh(roadGeo, roadMat);
        this.road.rotation.x = -Math.PI / 2;
        this.road.position.z = -450;
        this.scene.add(this.road);

        // Start Animation Loop
        this.animate();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.gameState === 'SPRINTING') {
            const delta = this.clock.getDelta();
            const speed = (this.power / 100) + 0.5;

            // Move road texture
            this.roadTexture.offset.y += speed * delta;

            // Camera shake on high power
            if (this.power > 800) {
                this.camera3D.position.x = (Math.random() - 0.5) * 0.05;
                this.camera3D.position.y = 1.6 + (Math.random() - 0.5) * 0.05;
            } else {
                this.camera3D.position.x = 0;
                this.camera3D.position.y = 1.6;
            }
        }

        this.renderer.render(this.scene, this.camera3D);
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

        if (this.lastWristY !== null && this.gameState === 'SPRINTING') {
            const diff = Math.abs(currentY - this.lastWristY);
            if (diff > this.movementThreshold) {
                this.power += diff * 900;
                if (this.power > 1500) this.power = 1500;
            }
        }

        this.lastWristY = currentY;
        this.ctx.restore();
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
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(e => console.warn("Fullscreen denegado:", e));
            }
            this.startCountdown();
        });
        this.elements.restartBtn.addEventListener('click', () => this.reset());

        window.addEventListener('resize', () => {
            if (this.camera3D && this.renderer) {
                this.camera3D.aspect = window.innerWidth / window.innerHeight;
                this.camera3D.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        });
    }

    startCountdown() {
        this.gameState = 'COUNTDOWN';

        // Inicializar Audio y Pose solo después de interacción del usuario
        if (!this.audioCtx) this.initAudio();
        if (!this.pose) this.initPose();

        const nameInput = document.getElementById('player-name');
        this.playerName = nameInput ? nameInput.value : "Ciclista";

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

        const jitter = (Math.random() - 0.5) * 20;
        this.power = Math.max(0, this.power + jitter);
        this.npcPowers = this.npcPowers.map(p => Math.max(200, p + (Math.random() - 0.5) * 50));

        if (this.power > 0) this.power -= 8;
        if (this.power > this.maxPower) this.maxPower = this.power;

        const speed = (this.power / 12) + 15;
        this.distance -= speed * 0.1;

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
