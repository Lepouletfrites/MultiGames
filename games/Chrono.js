"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChronoGame = void 0;
var ChronoGame = /** @class */ (function () {
    function ChronoGame(io, roomId, p1Id, p2Id) {
        this.onEnd = null;
        // Scores
        this.scores = {};
        // État de la manche
        this.targetTime = 0; // La cible (ex: 12500 ms)
        this.startTime = 0; // Quand le chrono a démarré
        this.playerTimes = {}; // Temps arrêtés par les joueurs
        this.tickInterval = null;
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;
    }
    ChronoGame.prototype.start = function (onEnd) {
        this.onEnd = onEnd;
        this.startNewRound();
    };
    ChronoGame.prototype.startNewRound = function () {
        var _this = this;
        // 1. Reset des variables de manche
        this.playerTimes[this.p1] = null;
        this.playerTimes[this.p2] = null;
        // 2. Définir une cible aléatoire entre 10 et 20 secondes (ex: 14.5s)
        // On arrondit à 1 décimale pour que ce soit joli
        var randomSec = (Math.random() * 10) + 10;
        this.targetTime = Math.round(randomSec * 10) / 10; // ex: 14.2
        // 3. Annonce de la cible
        this.broadcastUI("CIBLE : ".concat(this.targetTime.toFixed(1), " SECONDES"), "PRÉPAREZ-VOUS...", true);
        // 4. Démarrage après 3 secondes
        setTimeout(function () {
            _this.beginTimer();
        }, 3000);
    };
    ChronoGame.prototype.beginTimer = function () {
        var _this = this;
        this.startTime = Date.now();
        var secondsPassed = 0;
        // On active le bouton STOP
        this.broadcastUI("CIBLE : ".concat(this.targetTime.toFixed(1), "s"), "C'EST PARTI !", false);
        // Boucle qui met à jour l'affichage chaque seconde
        this.tickInterval = setInterval(function () {
            secondsPassed++;
            var elapsed = Date.now() - _this.startTime;
            // Si tout le monde a fini, on coupe
            if (_this.playerTimes[_this.p1] && _this.playerTimes[_this.p2]) {
                if (_this.tickInterval)
                    clearInterval(_this.tickInterval);
                return;
            }
            // Si on dépasse 5 secondes -> MODE AVEUGLE
            if (secondsPassed >= 5) {
                _this.broadcastUI("CIBLE : ".concat(_this.targetTime.toFixed(1), "s"), "???", false, true); // true = garde les boutons actifs
            }
            else {
                // Sinon on affiche les secondes (1s... 2s...)
                _this.broadcastUI("CIBLE : ".concat(_this.targetTime.toFixed(1), "s"), "".concat(secondsPassed, "s..."), false, true);
            }
            // Sécurité : Si ça fait 30 secondes, on arrête tout (AFK)
            if (elapsed > 30000) {
                _this.resolveRound();
            }
        }, 1000);
    };
    ChronoGame.prototype.handleAction = function (playerId, actionId) {
        // Si le joueur a déjà arrêté son temps, on ignore
        if (this.playerTimes[playerId])
            return;
        // On enregistre son temps
        var duration = (Date.now() - this.startTime) / 1000; // en secondes
        this.playerTimes[playerId] = duration;
        // On désactive son bouton et on lui dit "Bien reçu"
        this.sendPlayerUI(playerId, "Arr\u00EAt\u00E9 \u00E0 ??? (Cible: ".concat(this.targetTime, "s)"), true);
        // Si les deux ont fini, on résout la manche
        if (this.playerTimes[this.p1] && this.playerTimes[this.p2]) {
            this.resolveRound();
        }
    };
    ChronoGame.prototype.resolveRound = function () {
        var _this = this;
        if (this.tickInterval)
            clearInterval(this.tickInterval);
        var t1 = this.playerTimes[this.p1] || 999; // 999 si pas joué
        var t2 = this.playerTimes[this.p2] || 999;
        // Calcul de la différence (écart)
        var diff1 = Math.abs(t1 - this.targetTime);
        var diff2 = Math.abs(t2 - this.targetTime);
        var winnerId;
        var msg = "";
        if (diff1 < diff2) {
            winnerId = this.p1;
            this.scores[this.p1]++;
        }
        else {
            winnerId = this.p2;
            this.scores[this.p2]++;
        }
        msg = "Cible: ".concat(this.targetTime, "s\n");
        msg += "J1: ".concat(t1.toFixed(2), "s (Ecart: ").concat(diff1.toFixed(2), ")\n");
        msg += "J2: ".concat(t2.toFixed(2), "s (Ecart: ").concat(diff2.toFixed(2), ")");
        // Nettoyage écran
        this.broadcastUI("RÉSULTATS...", "", true);
        // Vérification victoire finale (3 points)
        if (this.scores[winnerId] >= 3) {
            this.finishGame(winnerId, msg);
        }
        else {
            // Manche suivante
            var winnerName = (winnerId === this.p1) ? "J1" : "J2";
            this.io.to(this.roomId).emit('modal', {
                title: "".concat(winnerName, " GAGNE LE POINT"),
                message: msg,
                btnText: "..."
            });
            setTimeout(function () {
                _this.io.to(_this.roomId).emit('modal', { close: true });
                _this.startNewRound();
            }, 4000); // 4 secondes pour lire les temps
        }
    };
    ChronoGame.prototype.finishGame = function (winnerId, finalMsg) {
        var p1Name = (winnerId === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE",
            message: "".concat(p1Name, " est le ma\u00EEtre du temps !\nScore: ").concat(this.scores[this.p1], "-").concat(this.scores[this.p2]),
            btnText: "RETOUR AU HUB"
        });
        if (this.onEnd)
            this.onEnd(winnerId);
    };
    // Fonction d'affichage générique
    ChronoGame.prototype.broadcastUI = function (title, centerText, buttonsDisabled, keepButtonsActiveIfPlayed) {
        if (keepButtonsActiveIfPlayed === void 0) { keepButtonsActiveIfPlayed = false; }
        this.sendPlayerUI(this.p1, centerText, buttonsDisabled && !this.playerTimes[this.p1], title);
        this.sendPlayerUI(this.p2, centerText, buttonsDisabled && !this.playerTimes[this.p2], title);
    };
    ChronoGame.prototype.sendPlayerUI = function (playerId, centerText, disabled, customTitle) {
        var ui = {
            title: customTitle || "\u23F1\uFE0F CHRONO - MANCHE ".concat(this.scores[this.p1] + this.scores[this.p2] + 1),
            status: centerText,
            displays: [
                { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
                { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
            ],
            buttons: [
                {
                    label: "STOP 🛑",
                    actionId: "STOP",
                    color: "orange",
                    disabled: disabled,
                    size: 'giant' // On réutilise le gros bouton
                }
            ]
        };
        // Si le joueur a déjà joué, on grise son bouton pour lui montrer
        if (this.playerTimes[playerId]) {
            ui.buttons[0].disabled = true;
            ui.buttons[0].color = "grey";
            ui.buttons[0].label = "ATTENTE...";
        }
        this.io.to(playerId).emit('renderUI', ui);
    };
    ChronoGame.prototype.handleDisconnect = function (playerId) {
        if (this.tickInterval)
            clearInterval(this.tickInterval);
        var winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd)
            this.onEnd(winner);
    };
    return ChronoGame;
}());
exports.ChronoGame = ChronoGame;
