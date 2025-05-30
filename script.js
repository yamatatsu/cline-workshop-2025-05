// ゲーム設定
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const BLOCK_SIZE = 30;

// サウンドシステム
class SoundSystem {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.initialized = false;
        this.userInteracted = false;
        console.log('SoundSystem: 初期化開始');
    }
    
    async initAudio() {
        if (this.initialized) {
            console.log('SoundSystem: 既に初期化済み');
            return true;
        }
        
        try {
            console.log('SoundSystem: AudioContext作成中...');
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            console.log('SoundSystem: AudioContext状態:', this.audioContext.state);
            
            // iOSでは最初にsuspended状態になるため、resume()を呼び出す
            if (this.audioContext.state === 'suspended') {
                console.log('SoundSystem: AudioContextをresume中...');
                await this.audioContext.resume();
                console.log('SoundSystem: AudioContext状態 (resume後):', this.audioContext.state);
            }
            
            this.initialized = true;
            this.enabled = true;
            console.log('SoundSystem: 初期化完了');
            return true;
        } catch (e) {
            console.warn('SoundSystem: Web Audio API not supported', e);
            this.enabled = false;
            return false;
        }
    }
    
    async enableAudio() {
        console.log('SoundSystem: enableAudio呼び出し');
        this.userInteracted = true;
        return await this.initAudio();
    }
    
    async playTone(frequency, duration, type = 'sine', volume = 0.1) {
        if (!this.enabled || !this.audioContext) {
            console.log('SoundSystem: サウンド無効またはAudioContext未初期化');
            return;
        }
        
        // AudioContextが停止している場合は再開を試みる
        if (this.audioContext.state === 'suspended') {
            console.log('SoundSystem: AudioContextが停止中、再開を試みます');
            try {
                await this.audioContext.resume();
                console.log('SoundSystem: AudioContext再開成功');
            } catch (e) {
                console.warn('SoundSystem: AudioContext再開失敗', e);
                return;
            }
        }
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
            
            console.log('SoundSystem: 音再生成功 -', frequency + 'Hz');
        } catch (e) {
            console.warn('SoundSystem: 音再生失敗', e);
        }
    }
    
    playMove() {
        this.playTone(800, 0.1, 'square', 0.05);
    }
    
    playRotate() {
        this.playTone(600, 0.15, 'triangle', 0.06);
    }
    
    playDrop() {
        this.playTone(400, 0.2, 'sawtooth', 0.08);
    }
    
    playLineClear() {
        // 複数の音を重ねてライン消去音を作成
        this.playTone(523, 0.3, 'sine', 0.1); // C5
        setTimeout(() => this.playTone(659, 0.3, 'sine', 0.1), 100); // E5
        setTimeout(() => this.playTone(784, 0.3, 'sine', 0.1), 200); // G5
    }
    
    playGameOver() {
        // 下降する音階でゲームオーバー音
        const notes = [523, 494, 440, 392, 349]; // C5 -> F4
        notes.forEach((note, index) => {
            setTimeout(() => this.playTone(note, 0.4, 'sine', 0.08), index * 200);
        });
    }
    
    playLevelUp() {
        // 上昇する音階でレベルアップ音
        const notes = [392, 440, 494, 523, 587]; // G4 -> D5
        notes.forEach((note, index) => {
            setTimeout(() => this.playTone(note, 0.2, 'triangle', 0.06), index * 100);
        });
    }
}

// テトリミノの形状定義
const TETROMINOS = {
    I: {
        shape: [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ],
        color: '#00f5ff'
    },
    O: {
        shape: [
            [1, 1],
            [1, 1]
        ],
        color: '#ffff00'
    },
    T: {
        shape: [
            [0, 1, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        color: '#a000f0'
    },
    S: {
        shape: [
            [0, 1, 1],
            [1, 1, 0],
            [0, 0, 0]
        ],
        color: '#00f000'
    },
    Z: {
        shape: [
            [1, 1, 0],
            [0, 1, 1],
            [0, 0, 0]
        ],
        color: '#f00000'
    },
    J: {
        shape: [
            [1, 0, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        color: '#0000f0'
    },
    L: {
        shape: [
            [0, 0, 1],
            [1, 1, 1],
            [0, 0, 0]
        ],
        color: '#ff7f00'
    }
};

// ゲーム状態
class TetrisGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById('next-canvas');
        this.nextCtx = this.nextCanvas.getContext('2d');
        
        this.board = this.createBoard();
        this.currentPiece = null;
        this.nextPiece = null;
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.dropTime = 0;
        this.dropInterval = 1000;
        this.lastTime = 0;
        this.gameRunning = false;
        this.paused = false;
        this.previousLevel = 1;
        this.gameStarted = false;
        
        // サウンドシステムを初期化
        this.soundSystem = new SoundSystem();
        
        this.init();
    }
    
    createBoard() {
        return Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(0));
    }
    
    init() {
        this.setupEventListeners();
        this.showStartScreen();
    }
    
    showStartScreen() {
        const startScreen = document.getElementById('start-screen');
        const gameCanvas = document.getElementById('game-canvas');
        
        if (startScreen) {
            startScreen.classList.remove('hidden');
            gameCanvas.style.opacity = '0.3';
        }
    }
    
    hideStartScreen() {
        const startScreen = document.getElementById('start-screen');
        const gameCanvas = document.getElementById('game-canvas');
        
        if (startScreen) {
            startScreen.classList.add('hidden');
            gameCanvas.style.opacity = '1';
        }
    }
    
    async startGame() {
        console.log('ゲーム開始処理開始');
        
        // サウンドシステムを有効化
        const audioEnabled = await this.soundSystem.enableAudio();
        console.log('サウンド有効化結果:', audioEnabled);
        
        // スタート画面を非表示
        this.hideStartScreen();
        
        // ゲーム初期化
        this.generateNextPiece();
        this.spawnPiece();
        this.updateDisplay();
        this.gameRunning = true;
        this.gameStarted = true;
        
        console.log('ゲーム開始完了');
        this.gameLoop();
    }
    
    setupEventListeners() {
        // スタートボタンのイベントリスナー
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                console.log('スタートボタンがクリックされました');
                await this.startGame();
            });
            
            startBtn.addEventListener('touchstart', async (e) => {
                e.preventDefault();
                console.log('スタートボタンがタップされました');
                await this.startGame();
            });
        }
        
        document.addEventListener('keydown', (e) => {
            if (!this.gameRunning || this.paused) {
                if (e.code === 'KeyP') {
                    this.togglePause();
                }
                return;
            }
            
            switch(e.code) {
                case 'ArrowLeft':
                    this.movePiece(-1, 0);
                    break;
                case 'ArrowRight':
                    this.movePiece(1, 0);
                    break;
                case 'ArrowDown':
                    this.movePiece(0, 1);
                    break;
                case 'ArrowUp':
                    this.rotatePiece();
                    break;
                case 'Space':
                    this.hardDrop();
                    break;
                case 'KeyP':
                    this.togglePause();
                    break;
            }
        });
        
        document.getElementById('restart-btn').addEventListener('click', async () => {
            await this.restart();
        });
        
        // タッチ操作ボタンのイベントリスナー
        this.setupTouchControls();
    }
    
    generateNextPiece() {
        const pieces = Object.keys(TETROMINOS);
        const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
        this.nextPiece = {
            type: randomPiece,
            shape: TETROMINOS[randomPiece].shape,
            color: TETROMINOS[randomPiece].color,
            x: 0,
            y: 0
        };
        this.drawNextPiece();
    }
    
    spawnPiece() {
        this.currentPiece = {
            ...this.nextPiece,
            x: Math.floor(BOARD_WIDTH / 2) - Math.floor(this.nextPiece.shape[0].length / 2),
            y: 0
        };
        
        this.generateNextPiece();
        
        if (this.isCollision(this.currentPiece, 0, 0)) {
            this.gameOver();
        }
    }
    
    movePiece(dx, dy) {
        if (!this.isCollision(this.currentPiece, dx, dy)) {
            this.currentPiece.x += dx;
            this.currentPiece.y += dy;
            // 横移動の場合のみサウンドを再生
            if (dx !== 0) {
                this.soundSystem.playMove();
            }
            return true;
        }
        return false;
    }
    
    rotatePiece() {
        const rotated = this.rotate(this.currentPiece.shape);
        const originalShape = this.currentPiece.shape;
        this.currentPiece.shape = rotated;
        
        if (this.isCollision(this.currentPiece, 0, 0)) {
            this.currentPiece.shape = originalShape;
        } else {
            // 回転が成功した場合のみサウンドを再生
            this.soundSystem.playRotate();
        }
    }
    
    rotate(matrix) {
        const N = matrix.length;
        const rotated = Array(N).fill().map(() => Array(N).fill(0));
        
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                rotated[j][N - 1 - i] = matrix[i][j];
            }
        }
        
        return rotated;
    }
    
    hardDrop() {
        while (this.movePiece(0, 1)) {
            this.score += 2;
        }
        this.soundSystem.playDrop();
        this.placePiece();
    }
    
    isCollision(piece, dx, dy) {
        const newX = piece.x + dx;
        const newY = piece.y + dy;
        
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x]) {
                    const boardX = newX + x;
                    const boardY = newY + y;
                    
                    if (boardX < 0 || boardX >= BOARD_WIDTH || 
                        boardY >= BOARD_HEIGHT || 
                        (boardY >= 0 && this.board[boardY][boardX])) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    placePiece() {
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    const boardY = this.currentPiece.y + y;
                    const boardX = this.currentPiece.x + x;
                    if (boardY >= 0) {
                        this.board[boardY][boardX] = this.currentPiece.color;
                    }
                }
            }
        }
        
        this.clearLines();
        this.spawnPiece();
    }
    
    clearLines() {
        let linesCleared = 0;
        
        for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            if (this.board[y].every(cell => cell !== 0)) {
                this.board.splice(y, 1);
                this.board.unshift(Array(BOARD_WIDTH).fill(0));
                linesCleared++;
                y++; // 同じ行を再チェック
            }
        }
        
        if (linesCleared > 0) {
            this.lines += linesCleared;
            this.score += this.calculateScore(linesCleared);
            const newLevel = Math.floor(this.lines / 10) + 1;
            
            // レベルアップ判定
            if (newLevel > this.level) {
                this.soundSystem.playLevelUp();
            }
            
            this.level = newLevel;
            this.dropInterval = Math.max(50, 1000 - (this.level - 1) * 50);
            this.updateDisplay();
            this.animateScoreUpdate();
            
            // ライン消去音を再生
            this.soundSystem.playLineClear();
        }
    }
    
    calculateScore(lines) {
        const baseScore = [0, 40, 100, 300, 1200];
        return baseScore[lines] * this.level;
    }
    
    animateScoreUpdate() {
        const scoreElement = document.getElementById('score');
        scoreElement.classList.add('score-update');
        setTimeout(() => {
            scoreElement.classList.remove('score-update');
        }, 300);
    }
    
    gameLoop(time = 0) {
        if (!this.gameRunning) return;
        
        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        
        if (!this.paused) {
            this.dropTime += deltaTime;
            
            if (this.dropTime > this.dropInterval) {
                if (!this.movePiece(0, 1)) {
                    this.placePiece();
                }
                this.dropTime = 0;
            }
            
            this.draw();
        }
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    draw() {
        // ボードをクリア
        this.ctx.fillStyle = '#1a202c';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // グリッドを描画
        this.drawGrid();
        
        // 配置済みのブロックを描画
        this.drawBoard();
        
        // 現在のピースを描画
        if (this.currentPiece) {
            this.drawPiece(this.currentPiece);
        }
        
        // ゴーストピースを描画
        this.drawGhost();
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#2d3748';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x <= BOARD_WIDTH; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * BLOCK_SIZE, 0);
            this.ctx.lineTo(x * BLOCK_SIZE, BOARD_HEIGHT * BLOCK_SIZE);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= BOARD_HEIGHT; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * BLOCK_SIZE);
            this.ctx.lineTo(BOARD_WIDTH * BLOCK_SIZE, y * BLOCK_SIZE);
            this.ctx.stroke();
        }
    }
    
    drawBoard() {
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                if (this.board[y][x]) {
                    this.drawBlock(x, y, this.board[y][x]);
                }
            }
        }
    }
    
    drawPiece(piece) {
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x]) {
                    this.drawBlock(piece.x + x, piece.y + y, piece.color);
                }
            }
        }
    }
    
    drawGhost() {
        if (!this.currentPiece) return;
        
        const ghost = { ...this.currentPiece };
        while (!this.isCollision(ghost, 0, 1)) {
            ghost.y++;
        }
        
        this.ctx.globalAlpha = 0.3;
        for (let y = 0; y < ghost.shape.length; y++) {
            for (let x = 0; x < ghost.shape[y].length; x++) {
                if (ghost.shape[y][x]) {
                    this.drawBlock(ghost.x + x, ghost.y + y, ghost.color);
                }
            }
        }
        this.ctx.globalAlpha = 1.0;
    }
    
    drawBlock(x, y, color) {
        const pixelX = x * BLOCK_SIZE;
        const pixelY = y * BLOCK_SIZE;
        
        // メインブロック
        this.ctx.fillStyle = color;
        this.ctx.fillRect(pixelX, pixelY, BLOCK_SIZE, BLOCK_SIZE);
        
        // ハイライト効果
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(pixelX, pixelY, BLOCK_SIZE, 2);
        this.ctx.fillRect(pixelX, pixelY, 2, BLOCK_SIZE);
        
        // 影効果
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(pixelX, pixelY + BLOCK_SIZE - 2, BLOCK_SIZE, 2);
        this.ctx.fillRect(pixelX + BLOCK_SIZE - 2, pixelY, 2, BLOCK_SIZE);
        
        // 境界線
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(pixelX, pixelY, BLOCK_SIZE, BLOCK_SIZE);
    }
    
    drawNextPiece() {
        this.nextCtx.fillStyle = '#ffffff';
        this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        
        if (!this.nextPiece) return;
        
        const shape = this.nextPiece.shape;
        const blockSize = 20;
        const offsetX = (this.nextCanvas.width - shape[0].length * blockSize) / 2;
        const offsetY = (this.nextCanvas.height - shape.length * blockSize) / 2;
        
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    const pixelX = offsetX + x * blockSize;
                    const pixelY = offsetY + y * blockSize;
                    
                    this.nextCtx.fillStyle = this.nextPiece.color;
                    this.nextCtx.fillRect(pixelX, pixelY, blockSize, blockSize);
                    
                    this.nextCtx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                    this.nextCtx.lineWidth = 1;
                    this.nextCtx.strokeRect(pixelX, pixelY, blockSize, blockSize);
                }
            }
        }
    }
    
    updateDisplay() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('level').textContent = this.level;
        document.getElementById('lines').textContent = this.lines;
    }
    
    togglePause() {
        this.paused = !this.paused;
        const pauseScreen = document.getElementById('pause-screen');
        
        if (this.paused) {
            pauseScreen.classList.remove('hidden');
        } else {
            pauseScreen.classList.add('hidden');
        }
    }
    
    gameOver() {
        this.gameRunning = false;
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('game-over').classList.remove('hidden');
        
        // ゲームオーバー音を再生
        this.soundSystem.playGameOver();
    }
    
    setupTouchControls() {
        // タッチ操作ボタンのイベントリスナーを設定
        const leftBtn = document.getElementById('left-btn');
        const rightBtn = document.getElementById('right-btn');
        const downBtn = document.getElementById('down-btn');
        const rotateBtn = document.getElementById('rotate-btn');
        const dropBtn = document.getElementById('drop-btn');
        const pauseBtn = document.getElementById('pause-btn');
        
        // 左移動
        leftBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.movePiece(-1, 0);
            }
        });
        
        leftBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.movePiece(-1, 0);
            }
        });
        
        // 右移動
        rightBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.movePiece(1, 0);
            }
        });
        
        rightBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.movePiece(1, 0);
            }
        });
        
        // 下移動（高速落下）
        downBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.movePiece(0, 1);
            }
        });
        
        downBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.movePiece(0, 1);
            }
        });
        
        // 回転
        rotateBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.rotatePiece();
            }
        });
        
        rotateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.rotatePiece();
            }
        });
        
        // ハードドロップ
        dropBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.hardDrop();
            }
        });
        
        dropBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.gameRunning && !this.paused) {
                this.hardDrop();
            }
        });
        
        // 一時停止
        pauseBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.gameRunning) {
                this.togglePause();
            }
        });
        
        pauseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.gameRunning) {
                this.togglePause();
            }
        });
    }
    
    async restart() {
        this.board = this.createBoard();
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.dropTime = 0;
        this.dropInterval = 1000;
        this.paused = false;
        
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('pause-screen').classList.add('hidden');
        
        // サウンドシステムを再有効化
        await this.soundSystem.enableAudio();
        
        this.generateNextPiece();
        this.spawnPiece();
        this.updateDisplay();
        this.gameRunning = true;
        this.gameLoop();
    }
}

// ゲーム開始
window.addEventListener('load', () => {
    new TetrisGame();
});
