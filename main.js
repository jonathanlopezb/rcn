/**
 * Desafío Último Kilómetro
 * FASE 1: Interfaz y Animación Base
 */

import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import QRCode from 'qrcode';

class SprintGame {
    constructor() {
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
        this.camera = null;
        this.lastWristY = null;
        this.movementThreshold = 0.04;

        this.initDOM();
        this.initEvents();
        this.initAudio();
        this.initNarrator();
        this.initPose();
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

        this.camera = new Camera(this.elements.video, {
            onFrame: async () => {
                await this.pose.send({ image: this.elements.video });
            },
            width: 640,
            height: 480
        });
        this.camera.start();
    }

    onPoseResults(results) {
        if (!results.poseLandmarks) return;

        // Dibujar en el canvas de previsualización
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        this.ctx.drawImage(results.image, 0, 0, this.elements.canvas.width, this.elements.canvas.height);

        // Lógica de detección de movimiento de brazos (pedaleo simulado)
        const wristR = results.poseLandmarks[16];
        const wristL = results.poseLandmarks[15];
        if (!wristR || !wristL) return;

        const currentY = (wristR.y + wristL.y) / 2;

        if (this.lastWristY !== null && this.gameState === 'SPRINTING') {
            const diff = Math.abs(currentY - this.lastWristY);
            if (diff > this.movementThreshold) {
                // El usuario está moviendo los brazos. Aumentamos potencia.
                this.power += diff * 800;
                if (this.power > 1500) this.power = 1500;
            }
        }

        this.lastWristY = currentY;
        this.ctx.restore();
    }

    initNarrator() {
        this.synth = window.speechSynthesis;
        this.narratorVoice = null;

        // Intentar cargar voces en español
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
        if (priority) this.synth.cancel(); // Cancelar si es prioridad (ej: cuenta atrás)

        if (this.synth.speaking && !priority) return; // No interrumpir si no es prioridad

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.narratorVoice;
        utterance.rate = 1.1;
        utterance.pitch = 1.1;
        this.synth.speak(utterance);
    }

    initAudio() {
        // En una app real usaríamos archivos .mp3, aquí simulamos con Web Audio API para mantener ligereza
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    playCrowdSound() {
        if (!this.audioCtx) return;
        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        oscillator.type = 'brown'; // Ruido café para simular multitud
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
            startOverlay: document.getElementById('start-overlay'),
            countdownOverlay: document.getElementById('countdown-overlay'),
            resultOverlay: document.getElementById('result-overlay'),
            startBtn: document.getElementById('start-btn'),
            restartBtn: document.getElementById('restart-btn'),
            countdownText: document.getElementById('countdown-text'),
            timer: document.getElementById('timer'),
            distance: document.getElementById('distance'),
            powerFill: document.getElementById('power-fill'),
            powerText: document.getElementById('power-text'),
            roadStrips: document.querySelector('.road-strips'),
            resTime: document.getElementById('res-time'),
            resPower: document.getElementById('res-power'),
            video: document.getElementById('input-video'),
            canvas: document.getElementById('output-canvas')
        };
        this.ctx = this.elements.canvas.getContext('2d');
    }

    initEvents() {
        this.elements.startBtn.addEventListener('click', () => {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            }
            this.startCountdown();
        });

        this.elements.restartBtn.addEventListener('click', () => this.reset());

        // Simulación manual ligera (teclas F por ahora para pruebas de Phase 1)
        window.addEventListener('keydown', (e) => {
            if (this.gameState === 'SPRINTING') {
                this.simulateEffort();
            }
        });
    }

    startCountdown() {
        this.gameState = 'COUNTDOWN';
        this.playerName = document.getElementById('player-name').value || "Ciclista";
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
        this.elements.roadStrips.style.animationPlayState = 'running';

        // Activar paralaje
        document.querySelectorAll('.parallax-layer').forEach(layer => {
            layer.style.animationPlayState = 'running';
        });

        this.playCrowdSound();
        this.increaseCrowdVolume(0.05);

        this.timerInterval = setInterval(() => {
            this.update();
        }, 100);
    }

    simulateEffort() {
        // En FASE 1, simulamos un pequeño empujón al presionar teclas
        this.power += 50;
        if (this.power > 1200) this.power = 1200;
    }

    update() {
        this.time += 0.1;

        // FASE 2: Potencia Dinámica (Fluctuación aleatoria)
        const jitter = (Math.random() - 0.5) * 20;
        this.power = Math.max(0, this.power + jitter);

        // NPC Logic (Simulación de competencia)
        this.npcPowers = this.npcPowers.map(p => Math.max(200, p + (Math.random() - 0.5) * 50));

        // Decaimiento natural de potencia del jugador
        if (this.power > 0) this.power -= 5;

        if (this.power > this.maxPower) this.maxPower = this.power;

        // Velocidad basada en potencia
        const speed = (this.power / 15) + 12;
        this.distance -= speed * 0.1;

        // Aumentar volumen del público según cercanía a meta
        if (this.distance < 300) this.increaseCrowdVolume(0.15);

        // Narración por hitos
        if (Math.ceil(this.distance) === 800) this.speak(`¡Atención que ${this.playerName} está bien ubicado!`);
        if (Math.ceil(this.distance) === 500) this.speak("¡Medio kilómetro para la gloria! ¡No aflojes!");
        if (Math.ceil(this.distance) === 200) this.speak("¡Doscientos metros! ¡Se siente el rugido del público!");
        if (Math.ceil(this.distance) === 50) this.speak("¡Último esfuerzo, va a ganar!");

        // Efecto visual de meta cerca
        if (this.distance < 50) {
            const finishLine = document.getElementById('finish-line');
            finishLine.style.display = 'block';
            finishLine.style.top = `${100 - (this.distance * 2)}%`;
        }

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
        // Timer
        const mins = Math.floor(this.time / 60);
        const secs = Math.floor(this.time % 60);
        const ms = Math.floor((this.time % 1) * 100);
        this.elements.timer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;

        // Distancia
        this.elements.distance.innerText = `${Math.ceil(this.distance)}m`;

        // Power Bar
        const percent = (this.power / 1200) * 100;
        this.elements.powerFill.style.width = `${percent}%`;
        this.elements.powerText.innerText = `${Math.floor(this.power)}W`;

        // Rankings
        this.positions.forEach((name, index) => {
            const el = document.getElementById(`rank-${index + 1}`);
            el.innerHTML = `${index + 1}º <span class="name">${name}</span>`;
            el.classList.toggle('active', name === 'TÚ');
        });

        // Animación carretera y paisajes (Parallax)
        const animSpeed = Math.max(0.04, 1 - (this.power / 1500));
        this.elements.roadStrips.style.animationDuration = `${animSpeed}s`;

        // Ajustar velocidad de paralaje basado en potencia
        const pSpeed = Math.max(0.2, (this.power / 1000) + 0.1);
        const mountains = document.querySelector('.layer-mountains');
        const trees = document.querySelector('.layer-trees');
        if (mountains) mountains.style.animationDuration = `${60 / pSpeed}s`;
        if (trees) trees.style.animationDuration = `${30 / pSpeed}s`;
    }

    async generateQR() {
        const qrContainer = document.getElementById('qrcode');
        const finalRank = this.positions.indexOf('TÚ') + 1;
        const resultText = `¡Desafío RCN! ${this.playerName} alcanzó la posición ${finalRank} con una potencia máxima de ${Math.floor(this.maxPower)}W. Desarrollado por Transelo Eventos.`;

        try {
            const qrDataUrl = await QRCode.toDataURL(resultText, {
                width: 150,
                margin: 2,
                color: {
                    dark: '#E30613',
                    light: '#FFFFFF'
                }
            });
            qrContainer.innerHTML = `<img src="${qrDataUrl}" alt="QR Resultado">`;
        } catch (err) {
            console.error('Error generando QR:', err);
        }
    }

    finish() {
        this.gameState = 'FINISHED';
        clearInterval(this.timerInterval);
        this.elements.roadStrips.style.animationPlayState = 'paused';

        // Detener paralaje
        document.querySelectorAll('.parallax-layer').forEach(layer => {
            layer.style.animationPlayState = 'paused';
        });

        this.increaseCrowdVolume(0.01);
        setTimeout(() => this.stopCrowdSound(), 2000);

        const finalRank = this.positions.indexOf('TÚ') + 1;
        const msg = finalRank === 1
            ? `¡Increíble! ¡${this.playerName} es el campeón de la etapa!`
            : `¡Meta! ${this.playerName} cruza en la posición ${finalRank}.`;
        this.speak(msg, true);

        document.getElementById('final-rank-text').innerText = `¡${finalRank}º POSICIÓN!`;

        this.elements.resTime.innerText = this.elements.timer.innerText;
        this.elements.resPower.innerText = `${Math.floor(this.maxPower)}W`;
        this.elements.resultOverlay.classList.add('active');

        // Flash visual de meta
        document.body.style.background = 'white';
        setTimeout(() => document.body.style.background = 'black', 100);
    }

    reset() {
        this.gameState = 'IDLE';
        this.distance = 1000;
        this.time = 0;
        this.power = 0;
        this.updateHUD();
        this.elements.resultOverlay.classList.remove('active');
        this.elements.startOverlay.classList.add('active');
    }
}

// Iniciar aplicación
document.addEventListener('DOMContentLoaded', () => {
    new SprintGame();
});
