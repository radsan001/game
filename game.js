const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const highScoreEl = document.getElementById('high-score');
const challengeTextEl = document.getElementById('challenge-text');
const overlayScreen = document.getElementById('overlay-screen');
const overlayTitle = document.getElementById('overlay-title');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnMute = document.getElementById('btn-mute');

// Game State
let cw, ch;
let isPlaying = false;
let isPaused = false;
let score = 0;
let highScore = localStorage.getItem('neonSmashHighScore') || 0;
let level = 1;
let speedMultiplier = 1;
let baseSpeed = 5;
let timeAlive = 0;
let lastTime = 0;
let animationId;
let challengeTimer = 0;
let spawnTimer = 0;
let spawnInterval = 1000;

highScoreEl.innerText = highScore;

// Viral Challenge Texts
const challenges = [
    "Only 1% can survive past Score 100!",
    "Can you beat my high score?",
    "Wait for it...",
    "Speed increasing!",
    "Don't blink!"
];

// Audio Context (initialized on user interaction)
let audioCtx;
let isMuted = false;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(type) {
    if (isMuted || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'smash') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'levelUp') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.setValueAtTime(500, audioCtx.currentTime + 0.1);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    }
}

// Resize Handling
function resize() {
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = cw;
    canvas.height = ch;
}
window.addEventListener('resize', resize);
resize();

// Input Handling
const mouse = { x: cw / 2, y: ch - 150 };
const keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };

function updateMouse(e) {
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.clientX) {
        clientX = e.clientX;
        clientY = e.clientY;
    } else {
        return;
    }
    
    // Smoothly interpolate for touch/mouse or snap directly depending on preference
    mouse.x = clientX;
    mouse.y = clientY;
}

window.addEventListener('mousemove', updateMouse);
window.addEventListener('touchmove', updateMouse, { passive: false });

window.addEventListener('keydown', e => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = true;
});
window.addEventListener('keyup', e => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
});

// Game Entities
class Player {
    constructor() {
        this.radius = 20;
        this.x = cw / 2;
        this.y = ch - 150;
        this.color = '#0ff'; // Cyan
        this.speed = 10;
    }
    
    draw() {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 20;
        ctx.fill();
        
        // Inner core
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.restore();
    }
    
    update() {
        // Keyboard movement overrides mouse if active
        let movedWithKey = false;
        if (keys.ArrowLeft) { this.x -= this.speed; movedWithKey = true; }
        if (keys.ArrowRight) { this.x += this.speed; movedWithKey = true; }
        if (keys.ArrowUp) { this.y -= this.speed; movedWithKey = true; }
        if (keys.ArrowDown) { this.y += this.speed; movedWithKey = true; }
        
        if (!movedWithKey) {
            // Lerp towards mouse/touch
            this.x += (mouse.x - this.x) * 0.2;
            this.y += (mouse.y - this.y) * 0.2;
        }
        
        // Bounds checking
        this.x = Math.max(this.radius, Math.min(cw - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(ch - this.radius, this.y));
        
        this.draw();
    }
}

class Obstacle {
    constructor() {
        this.radius = Math.random() * 15 + 15;
        this.x = Math.random() * (cw - this.radius * 2) + this.radius;
        this.y = -this.radius;
        // 70% chance good (green), 30% bad (red)
        this.isGood = Math.random() > 0.3;
        this.color = this.isGood ? '#0f0' : '#f00'; // Neon Green or Glowing Red
        this.velocity = {
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() * 3 + baseSpeed) * speedMultiplier
        };
        // Adding rotation for geometric look (if we draw shapes)
        this.angle = 0;
        this.spin = (Math.random() - 0.5) * 0.2;
        this.sides = Math.floor(Math.random() * 3) + 3; // 3 to 5 sides
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        ctx.beginPath();
        for (let i = 0; i < this.sides; i++) {
            ctx.lineTo(this.radius * Math.cos(this.angle + (i * 2 * Math.PI / this.sides)),
                       this.radius * Math.sin(this.angle + (i * 2 * Math.PI / this.sides)));
        }
        ctx.closePath();
        
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.stroke();
        
        ctx.fillStyle = this.isGood ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)';
        ctx.fill();
        ctx.restore();
    }
    
    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.angle += this.spin;
        this.draw();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 2;
        this.velocity = {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed
        };
        this.color = color;
        this.alpha = 1;
        this.decay = Math.random() * 0.02 + 0.02;
        this.size = Math.random() * 4 + 1;
    }
    
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
    }
    
    update() {
        this.velocity.x *= 0.95; // friction
        this.velocity.y *= 0.95;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= this.decay;
        this.draw();
    }
}

// Arrays for entities
let player;
let obstacles = [];
let particles = [];

function createExplosion(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function resetGame() {
    player = new Player();
    obstacles = [];
    particles = [];
    score = 0;
    level = 1;
    speedMultiplier = 1;
    spawnInterval = 1000;
    timeAlive = 0;
    scoreEl.innerText = score;
    levelEl.innerText = level;
    challengeTextEl.classList.remove('visible');
    overlayScreen.classList.remove('visible');
    isPlaying = true;
    isPaused = false;
    btnPause.innerText = "Pause";
    lastTime = performance.now();
    animate(lastTime);
}

function gameOver() {
    isPlaying = false;
    playSound('crash');
    createExplosion(player.x, player.y, player.color, 50);
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neonSmashHighScore', highScore);
        highScoreEl.innerText = highScore;
    }
    
    // Draw the final frame particles and stop
    setTimeout(() => {
        overlayTitle.innerText = "GAME OVER";
        overlayScreen.classList.add('visible');
    }, 1000);
}

// Main Game Loop
function animate(currentTime) {
    if (!isPlaying) {
        // Continue drawing particles even if game over, just for a bit
        if (particles.length > 0) {
            ctx.fillStyle = 'rgba(5, 5, 16, 0.3)'; // Trail effect
            ctx.fillRect(0, 0, cw, ch);
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.update();
                if (p.alpha <= 0) particles.splice(i, 1);
            }
            animationId = requestAnimationFrame(animate);
        }
        return;
    }
    
    if (isPaused) {
        lastTime = currentTime;
        animationId = requestAnimationFrame(animate);
        return;
    }

    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    timeAlive += deltaTime;
    challengeTimer += deltaTime;
    spawnTimer += deltaTime;

    // Difficulty Scaling every 15 seconds
    if (timeAlive > 15000) {
        timeAlive = 0;
        level++;
        levelEl.innerText = level;
        speedMultiplier += 0.2;
        spawnInterval = Math.max(300, spawnInterval - 100); // Faster spawning
        playSound('levelUp');
        
        // Flash UI
        document.getElementById('top-bar').style.animation = 'pulse 0.5s';
        setTimeout(() => document.getElementById('top-bar').style.animation = '', 500);
    }
    
    // Viral Hooks - Challenge text rotation
    if (challengeTimer > 8000) {
        challengeTimer = 0;
        const text = challenges[Math.floor(Math.random() * challenges.length)];
        challengeTextEl.innerText = text;
        challengeTextEl.classList.add('visible');
        setTimeout(() => challengeTextEl.classList.remove('visible'), 3000);
    }

    // Clear Screen with trailing effect
    ctx.fillStyle = 'rgba(5, 5, 16, 0.3)';
    ctx.fillRect(0, 0, cw, ch);
    
    // Spawning Obstacles
    if (spawnTimer > spawnInterval) {
        obstacles.push(new Obstacle());
        spawnTimer = 0;
    }

    // Update Player
    player.update();

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        if (p.alpha <= 0) particles.splice(i, 1);
    }

    // Update and Collide Obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.update();

        // Collision Detection (Circle vs Circle approximation)
        const dx = player.x - obs.x;
        const dy = player.y - obs.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < player.radius + obs.radius - 5) {
            // Collision!
            if (obs.isGood) {
                // Smash green
                score += 10;
                scoreEl.innerText = score;
                playSound('smash');
                createExplosion(obs.x, obs.y, obs.color, 15);
                obstacles.splice(i, 1);
            } else {
                // Hit red -> Game Over
                obstacles.splice(i, 1);
                gameOver();
            }
        } else if (obs.y - obs.radius > ch) {
            // Off screen
            obstacles.splice(i, 1);
            // Optional: punish for missing good items?
            // Let's keep it simple: missing good items just means no score.
        }
    }

    animationId = requestAnimationFrame(animate);
}

// Event Listeners
btnStart.addEventListener('click', () => {
    initAudio();
    resetGame();
});

btnPause.addEventListener('click', () => {
    if (!isPlaying) return;
    isPaused = !isPaused;
    btnPause.innerText = isPaused ? "Resume" : "Pause";
});

btnMute.addEventListener('click', () => {
    isMuted = !isMuted;
    btnMute.innerText = isMuted ? "Unmute" : "Mute";
    btnMute.style.color = isMuted ? '#f00' : '#fff';
    btnMute.style.borderColor = isMuted ? '#f00' : 'rgba(255, 255, 255, 0.3)';
});
