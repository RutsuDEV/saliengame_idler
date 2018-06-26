// ==UserScript==
// @name		Salien Game Idler Polish Edition
// @namespace	https://github.com/RukaDEV/saliengame_idler
// @version		0.0.1
// @author		RukashiChan
// @match		*://steamcommunity.com/saliengame/play
// @match		*://steamcommunity.com/saliengame/play/
// @grant		none
// ==/UserScript==

// to jest strefa którą chcesz zaatakować (zostaw to pola jak jest aby wybrać losową)
var target_zone = -1;

// Zmienne. Nie zmieniaj ich, chyba że wiesz, co robisz.
var real_round_length = 120; // Długość gry (w sekundach, do obliczania wyniku)
var resend_frequency = 110; // Częstotliwość, z jaką możemy powiedzieć, że zakończyliśmy rundę (może być inna niż prawdziwa długość)
var update_length = 1; // Czas oczekiwania między aktualizacjami (w sekundach)
var loop_rounds = true;
var language = "english"; // Używany język wyników POST
var access_token = "";
var current_game_id = undefined;
var current_game_start = undefined; // Znacznik czasu dla rozpoczęcia bieżącej gry
var time_passed_ms = 0;
var current_timeout = undefined;
var max_retry = 5; // Maksymalna liczba ponownych prób wysłania żądań
var auto_first_join = true; // Automatycznie połącz najpierw z najlepszą strefą
var current_planet_id = undefined;
var auto_switch_planet = {
	"active": false, // Automatycznie przełącz się na najlepszą dostępną planetę (true: yes, false: no)
	"current_difficulty": undefined,
	"wanted_difficulty": 3, // Preferowany poziom trudności. Sprawdza planety, jeśli aktualna się różni
	"rounds_before_check": 5, // Jeśli nie znajdujemy się w wymaganej strefie trudności, zaczynamy sprawdzać planety w tej ilości rund
	"current_round": 0
};
var gui; // lokalna zmienna gui
var start_button = false; // jest już naciśnięty przycisk start?

class BotGUI {
	constructor(state) {
		console.log('GUI został stworzony');

		this.state = state;
		
		this.createStatusWindow();
		this.createProgressBar();
	}

	createStatusWindow() {
		if(document.getElementById('salienbot_gui')) {
			return false;
		}

		var $statusWindow = $J([
			'<div id="salienbot_gui" style="background: #2c3e50; z-index: 1; border: 3px solid #34495e; padding: 20px; margin-left:25px; width: 300px; transform: translate(0, 0);">',
				'<h1><a href="https://github.com/RukaDEV/saliengame_idler">Salien Game Idler Polish Edition</a></h1>',
				'<p style="margin-top: -.8em; font-size: .75em"><span id="salienbot_status"></span></p>', // Uruchomione lub zatrzymane
				'<p><b>Zadanie:</b> <span id="salienbot_task">Inicjowanie</span></p>', // Aktualne zadanie
				`<p><b>Strefa docelowa:</b> <span id="salienbot_zone">żadna</span></p>`,
				`<p style="display: none;" id="salienbot_zone_difficulty_div"><b>Trudność strefy:</b> <span id="salienbot_zone_difficulty"></span></p>`,
				'<p><b>Poziom:</b> <span id="salienbot_level">' + this.state.level + '</span> &nbsp;&nbsp;&nbsp;&nbsp; <b>Doświadczenie:</b> <span id="salienbot_exp">' + this.state.exp + '</span></p>',
				'<p><b>Kolejny poziom za:</b> <span id="salienbot_esttimlvl"></span></p>',
				'<p><input style="border:0; background:#34495e; color:white; text-align:center; padding:6px;" id="disableAnimsBtn" type="button" onclick="INJECT_disable_animations()" value="Wyłącz animacje"/></p><p><b><span id="salienbot_copyright"></span></b></p>',
			'</div>'
		].join(''))

		$J('#salien_game_placeholder').append( $statusWindow )
	}

	createProgressBar() {
		this.progressbar = new CProgressBar(63);
		this.progressbar.x = 2
		this.progressbar.y = 48
	}

	updateStatus(running) {
		const statusTxt = running ? '<span style="color: green;">✓ Uruchomiony</span>' : '<span style="color: red;">✗ Zatrzymany</span>';

		$J('#salienbot_status').html(statusTxt);
	}

	updateTask(status, log_to_console) {
		if(log_to_console || log_to_console === undefined)
			console.log(status);
		document.getElementById('salienbot_task').innerText = status;
	}

	updateExp(exp) {
		document.getElementById('salienbot_exp').innerText = exp;
	}

	updateLevel(level) {
		document.getElementById('salienbot_level').innerText = level;
	}

	updateEstimatedTime(secondsLeft) {
		let date = new Date(null);
		date.setSeconds(secondsLeft);
		var result = date.toISOString().substr(8, 11).split(/[T:]/);

		var days = result[0]-1;
		var hours = result[1];
		var minutes = result[2];
		var seconds = result[3];

		var timeTxt = "";
		if(days > 0)
			timeTxt += days + "d ";
		if(hours > 0 || timeTxt.length > 0)
			timeTxt += hours + "h ";
		if(minutes > 0 || timeTxt.length > 0)
			timeTxt += minutes + "m ";

		timeTxt += seconds + "s";

		document.getElementById('salienbot_esttimlvl').innerText = timeTxt;
	}

	updateZone(zone, progress, difficulty) {
		var printString = zone;
		if(progress !== undefined)
			printString += " (" + (progress * 100).toFixed(2) + "% ukończono)"
		if(progress === undefined) {
			$J("#salienbot_zone_difficulty_div").hide();
			difficulty = "";
		}
		else {
			$J("#salienbot_zone_difficulty_div").show();
			gGame.m_State.m_Grid.m_Tiles[target_zone].addChild(this.progressbar)
		}
		
		var copyright = "Salien Game Idler Polish Edition by RukashiChan, orginal script by ensingm2";
		
		document.getElementById('salienbot_zone').innerText = printString;
		document.getElementById('salienbot_zone_difficulty').innerText = difficulty;
		document.getElementById('salienbot_copyright').innerText = copyright;
	}
};

function initGUI(){
	if (!gGame.m_State || gGame.m_State instanceof CBootState || gGame.m_IsStateLoading){
		if(gGame.m_State && !gGame.m_IsStateLoading && !start_button){
			start_button = true;
			console.log("Klikanie przycisku START");
			gGame.m_State.button.click();
		}
		setTimeout(function() { initGUI(); }, 100);
	} else {
		console.log(gGame);
		gui = new BotGUI({
			level: gPlayerInfo.level,
			exp: gPlayerInfo.score
		});

		// Uruchom globalny inicjator, który wywoła funkcję dla dowolnego ekranu, w którym się znajdujesz
		INJECT_init();
	}
};

function calculateTimeToNextLevel() {	
	const nextScoreAmount = get_max_score(target_zone);
	const missingExp = Math.ceil((gPlayerInfo.next_level_score - gPlayerInfo.score) / nextScoreAmount) * nextScoreAmount;
	const roundTime = resend_frequency + update_length;

	const secondsLeft = missingExp / nextScoreAmount * roundTime - time_passed_ms / 1000;

	return secondsLeft;
}

// Obsługa błędów AJAX w celu uniknięcia zablokowania skryptu przez pojedynczy błąd interfejsu API
function ajaxErrorHandling(ajaxObj, params, messagesArray) {
	ajaxObj.tryCount++;
	if (ajaxObj.tryCount <= ajaxObj.retryLimit) {
		var currentTask = "Ponowna próba za 5s do " + messagesArray[0] + " (Próba #" + ajaxObj.tryCount + "). Błąd: " + params.xhr.status + ": " + params.thrownError;
		gui.updateTask(currentTask);
		setTimeout(function() { $J.ajax(ajaxObj); }, 5000);
	}
	else {
		var currentTask = "Błąd " + messagesArray[1] + ": " + params.xhr.status + ": " + params.thrownError + " (Osiągnięto maksymalną liczbę prób).";
		gui.updateTask(currentTask);
	}
}

// Grab the user's access token
var INJECT_get_access_token = function() {
	$J.ajax({
		async: false,
		type: "GET",
		url: "https://steamcommunity.com/saliengame/gettoken",
		success: function(data) {
			if(data.token != undefined) {
				console.log("Masz dostęp do tokena: " + data.token);
				access_token = data.token;
			}
			else {
				console.log("Nie można pobrać tokenu dostępu.")
				access_token = undefined;
			}
		}
	});
}

// Wykonaj połączenie, aby rozpocząć rundę i rozpocznij proces bezczynności
var INJECT_start_round = function(zone, access_token, attempt_no) {
	if(attempt_no === undefined)
		attempt_no = 0;

	// Opuść grę, jeśli już jesteśmy w jednym.
	if(current_game_id !== undefined) {
		gui.updateTask("Wykryto poprzednią grę. Kończę ją.", true);
		INJECT_leave_round();
	}

	// Wyślij POST, aby dołączyć do gry.
	$J.ajax({
		async: false,
		type: "POST",
		url: "https://community.steam-api.com/ITerritoryControlMinigameService/JoinZone/v0001/",
		data: { access_token: access_token, zone_position: zone },
		tryCount : 0,
		retryLimit : max_retry,
		success: function(data) {
			if( $J.isEmptyObject(data.response) ) {
				// Sprawdź, czy strefa jest ukończona
				INJECT_update_grid(false); // Obsługa błędów ustawiona na wartość false, aby uniknąć zbyt wielu wywołań równoległych z parametrem setTimeout poniżej
				if(window.gGame.m_State.m_Grid.m_Tiles[target_zone].Info.captured || attempt_no >= max_retry) {
					if (auto_switch_planet.active == true)
						CheckSwitchBetterPlanet();
					else
						SwitchNextZone();
				}
				else {
					console.log("Błąd podczas otrzymywania odpowiedzi strefy:",data);
					gui.updateTask("Oczekiwanie 5s i ponowne wysłanie próby dołączenia (Próba #" + attempt_no + ").");
					setTimeout(function() { INJECT_start_round(zone, access_token, attempt_no+1); }, 5000);
				}
			}
			else {
				console.log("Runda pomyślnie rozpoczęła się w strefie #" + zone);
				console.log(data);

				// Ustaw cel
				target_zone = zone;
				
				// Zaktualizuj GUI
				gui.updateStatus(true);
				gui.updateZone(zone, data.response.zone_info.capture_progress, data.response.zone_info.difficulty);
				gui.updateEstimatedTime(calculateTimeToNextLevel());
		
				current_game_id = data.response.zone_info.gameid;

				if (auto_switch_planet.active == true) {
					if (auto_switch_planet.current_difficulty != data.response.zone_info.difficulty)
						auto_switch_planet.current_round = 0; // Zmieniono trudność, zresetuj licznik rund przed sprawdzeniem nowej planety

					auto_switch_planet.current_difficulty = data.response.zone_info.difficulty;

					if (auto_switch_planet.current_difficulty < auto_switch_planet.wanted_difficulty) {
						if (auto_switch_planet.current_round >= auto_switch_planet.rounds_before_check) {
							auto_switch_planet.current_round = 0;
							CheckSwitchBetterPlanet(true);
						} else {
							auto_switch_planet.current_round++;
						}
					}
				}
				
				current_game_start = new Date().getTime();
				INJECT_wait_for_end(resend_frequency);
			}
		},
		error: function (xhr, ajaxOptions, thrownError) {
			var messagesArray = ["rozpocząć rundę", "runda startowa"];
			var ajaxParams = {
				xhr: xhr, 
				ajaxOptions: ajaxOptions, 
				thrownError: thrownError
			};
			ajaxErrorHandling(this, ajaxParams, messagesArray);
		}
	});
}

// Zaktualizuj czas pozostały i poczekaj, aż runda się zakończy.
var INJECT_wait_for_end = function() {
	var now = new Date().getTime();
	time_passed_ms = now - current_game_start;
	var time_remaining_ms = (resend_frequency*1000) - time_passed_ms;
	var time_remaining = Math.round(time_remaining_ms/1000);

	// Zaktualizuj GUI
	gui.updateTask("Czekanie " + Math.max(time_remaining, 0) + " sekund na koniec rundy", false);
	gui.updateStatus(true);
	gui.updateEstimatedTime(calculateTimeToNextLevel())
	gui.progressbar.SetValue(time_passed_ms/(resend_frequency*1000))

	// Czekaj
	var wait_time = update_length*1000;;
	var callback;
	
	// Użyj bezwzględnych znaczników czasu, aby obliczyć, czy gra się skończyła, ponieważ czasy setTimeout nie zawsze są wiarygodne
	if(time_remaining_ms <= 0) {
		callback = function() { INJECT_end_round(); };
	}
	else { 
		callback = function() { INJECT_wait_for_end(); };
	}
	
	// Ustaw limit czasu
	current_timeout = setTimeout(callback, wait_time);
}

// Wyślij połączenie, aby zakończyć rundę i w razie potrzeby uruchom ponownie.
var INJECT_end_round = function(attempt_no) {
	if(attempt_no === undefined)
		attempt_no = 0;

	// Zdobądź maksymalny wynik, jaki możemy wysłać
	var score = get_max_score();

	// Zaktualizuj GUI
	gui.updateTask("Ending Round");

	// Opublikuj wywołanie "Yay my beat the level"
	$J.ajax({
		async: false,
		type: "POST",
		url: "https://community.steam-api.com/ITerritoryControlMinigameService/ReportScore/v0001/",
		data: { access_token: access_token, score: score, language: language },
		tryCount : 0,
		retryLimit : max_retry,
		success: function(data) {
			if( $J.isEmptyObject(data.response) ) {
				// Sprawdź, czy strefa jest ukończona
				INJECT_update_grid(false); // Obsługa błędów ustawiona na wartość false, aby uniknąć zbyt wielu wywołań równoległych z parametrem setTimeout poniżej
				if(window.gGame.m_State.m_Grid.m_Tiles[target_zone].Info.captured || attempt_no >= max_retry) {
					if (auto_switch_planet.active == true)
						CheckSwitchBetterPlanet();
					else
						SwitchNextZone();
				}
				else {
					console.log("Błąd podczas otrzymywania odpowiedzi strefy:",data);
					gui.updateTask("Oczekiwanie 5 sekund i ponowne wysłanie wyniku (Próba #" + attempt_no + ").");
					setTimeout(function() { INJECT_end_round(attempt_no+1); }, 5000);
				}
			}
			else {
				console.log("Pomyślnie zakończyliśmy rundę i otrzymaliśmy dane");
				console.log("Poziom: ", data.response.new_level, "\n Punkty doświadczenia: ", data.response.new_score);
				console.log(data);

				// Zaktualizuj informacje o graczu
				INJECT_update_player_info();

				// Zaktualizuj GUI
				gui.updateLevel(data.response.new_level);
				gui.updateExp(data.response.new_score);
				gui.updateEstimatedTime(calculateTimeToNextLevel());
				gui.updateZone("None");

				// Zrestartuj rundę, jeśli mamy ustawioną zmienną
				if(loop_rounds) {
					UpdateNotificationCounts();
					current_game_id = undefined;
					INJECT_start_round(target_zone, access_token)
				}
			}
		},
		error: function (xhr, ajaxOptions, thrownError) {
			var messagesArray = ["zakończyć rundę", "zakończenie rundy"];
			var ajaxParams = {
				xhr: xhr, 
				ajaxOptions: ajaxOptions, 
				thrownError: thrownError
			};
			ajaxErrorHandling(this, ajaxParams, messagesArray);
		}
	});
}

// Opuść istniejącą grę
var INJECT_leave_round = function() {
	if(current_game_id === undefined)
		return;

	console.log("Opuszczanie gry: " + current_game_id);

	// Anuluj limity czasu
	clearTimeout(current_timeout);

	// POST do punktu końcowego
	$J.ajax({
		async: false,
		type: "POST",
		url: "https://community.steam-api.com/IMiniGameService/LeaveGame/v0001/",
		data: { access_token: access_token, gameid: current_game_id },
		tryCount : 0,
		retryLimit : max_retry,
		success: function(data) {},
		error: function (xhr, ajaxOptions, thrownError) {
			var messagesArray = ["opuścić rundę", "opuszczanie rundy"];
			var ajaxParams = {
				xhr: xhr, 
				ajaxOptions: ajaxOptions, 
				thrownError: thrownError
			};
			ajaxErrorHandling(this, ajaxParams, messagesArray);
		}
	});

	// Wyczyść bieżący identyfikator gry
	current_game_id = undefined;

	// Zaktualizuj GUI
	gui.updateTask("Opuszczona Strefa #" + target_zone);
	gui.updateStatus(false);

	target_zone = -1;
}

// Zwraca 0 dla łatwych, 1 dla średnich, 2 dla trudnych
var INJECT_get_difficulty = function(zone_id) {
	return window.gGame.m_State.m_PlanetData.zones[zone_id].difficulty;
}

// Aktualizuje informacje o graczu
// Obecnie nieużywane. Miało to mieć nadzieję, że zaktualizuje interfejs użytkownika.
var INJECT_update_player_info = function() {
	gServer.GetPlayerInfo(
		function( results ) {
			gPlayerInfo = results.response;
		},
		function(){}
	);
}

// Zaktualizuj strefy siatki (mapy) na obecnej planecie
var INJECT_update_grid = function(error_handling) {
	if(current_planet_id === undefined)
		return;
	if (error_handling === undefined)
		error_handling = true;

	gui.updateTask('Aktualizacja siatki', true);

	// GET to the endpoint
	$J.ajax({
		async: false,
		type: "GET",
		url: "https://community.steam-api.com/ITerritoryControlMinigameService/GetPlanet/v0001/",
		data: { id: current_planet_id },
		tryCount : 0,
		retryLimit : max_retry,
		success: function(data) {
			window.gGame.m_State.m_PlanetData = data.response.planets[0];
			window.gGame.m_State.m_PlanetData.zones.forEach( function ( zone ) {
				window.gGame.m_State.m_Grid.m_Tiles[zone.zone_position].Info.progress = zone.capture_progress; 
				window.gGame.m_State.m_Grid.m_Tiles[zone.zone_position].Info.captured = zone.captured; 
				window.gGame.m_State.m_Grid.m_Tiles[zone.zone_position].Info.difficulty = zone.difficulty; 
			});
			console.log("Pomyślnie zaktualizowano dane map na planecie: " + current_planet_id);
		},
		error: function (xhr, ajaxOptions, thrownError) {
			if (error_handling == true) {
				var messagesArray = ["zaktualizuj siatkę", "aktualizowanie siatki"];
				var ajaxParams = {
					xhr: xhr, 
					ajaxOptions: ajaxOptions, 
					thrownError: thrownError
				};
				ajaxErrorHandling(this, ajaxParams, messagesArray);
			}
		}
	});
}

// Domyślnie maksymalny wynik bieżącej strefy i pełny czas trwania rundy, jeśli nie podano żadnych parametrów
function get_max_score(zone, round_duration) {
	// defaults
	if(zone === undefined)
		zone = target_zone;
	if(round_duration === undefined)
		round_duration = real_round_length;

	var difficulty = INJECT_get_difficulty(zone);
	var score = 5 * round_duration * Math.pow(2, (difficulty-1));

	return score;
}

// Uzyskaj najlepszą dostępną strefę
function GetBestZone() {
	var bestZoneIdx;
	var highestDifficulty = -1;

	gui.updateTask('Uzyskiwanie najlepszej strefy');

	for (var idx = 0; idx < window.gGame.m_State.m_Grid.m_Tiles.length; idx++) {
		var zone = window.gGame.m_State.m_Grid.m_Tiles[idx].Info;
		if (!zone.captured) {
			if (zone.boss) {
				console.log("Strefa " + idx + " z bossem. Przechodzenie na nią");
				return idx;
			}

			if(zone.difficulty > highestDifficulty) {
				highestDifficulty = zone.difficulty;
				maxProgress = zone.progress;
				bestZoneIdx = idx;
			} else if(zone.difficulty < highestDifficulty) continue;

			if(zone.progress < maxProgress) {
				maxProgress = zone.progress;
				bestZoneIdx = idx;
			}
		}
	}

	if(bestZoneIdx !== undefined) {
		console.log(`${window.gGame.m_State.m_PlanetData.state.name} - Strefa ${bestZoneIdx} Postęp: ${window.gGame.m_State.m_Grid.m_Tiles[bestZoneIdx].Info.progress} Trudność: ${window.gGame.m_State.m_Grid.m_Tiles[bestZoneIdx].Info.difficulty}`);
	}

	return bestZoneIdx;
}

// Zdobądź najlepszą dostępną planetę
function GetBestPlanet() {
	// Nie trzeba się ruszać, jeśli jesteśmy już w strefie o wymaganym poziomie trudności
	if(auto_switch_planet.current_difficulty == auto_switch_planet.wanted_difficulty)
		return current_planet_id;
	var bestPlanetId = undefined;
	var activePlanetsScore = [];
	var planetsMaxDifficulty = [];
	var maxScore = 0;
	var numberErrors = 0;
	
	gui.updateStatus('Uzyskiwanie najlepszej planety');
	
	// Wysyłanie GET'a do punktu kontrolnego
	$J.ajax({
		async: false,
		type: "GET",
		url: "https://community.steam-api.com/ITerritoryControlMinigameService/GetPlanets/v0001/",
		tryCount : 0,
		retryLimit : max_retry,
		success: function(data) {
			data.response.planets.forEach( function(planet) {
				if (planet.state.active == true && planet.state.captured == false)
					activePlanetsScore[planet.id] = 0;
					planetsMaxDifficulty[planet.id] = 0;
			});
		},
		error: function (xhr, ajaxOptions, thrownError) {
			var messagesArray = ["zdobądź aktywne planety", "uzyskiwanie aktywnych planet"];
			var ajaxParams = {
				xhr: xhr, 
				ajaxOptions: ajaxOptions, 
				thrownError: thrownError
			};
			ajaxErrorHandling(this, ajaxParams, messagesArray);
		}
	});
	
	// Zdobądź punkty każdej aktywnej planety
	Object.keys(activePlanetsScore).forEach ( function (planet_id) {
		// Wysyłanie GET'a do punktu kontrolnego
		$J.ajax({
			async: false,
			type: "GET",
			url: "https://community.steam-api.com/ITerritoryControlMinigameService/GetPlanet/v0001/",
			data: { id: planet_id },
			success: function(data) {
				data.response.planets[0].zones.forEach( function ( zone ) {
					if (zone.difficulty >= 1 && zone.difficulty <= 7 && zone.captured == false)
						activePlanetsScore[planet_id] += Math.ceil(Math.pow(10, (zone.difficulty - 1) * 2) * (1 - zone.capture_progress));
						if (zone.difficulty > planetsMaxDifficulty[planet_id])
							planetsMaxDifficulty[planet_id] = zone.difficulty;
				});
			},
			error: function() {
				numberErrors++;
			}
		});
		if (activePlanetsScore[planet_id] > maxScore) {
			maxScore = activePlanetsScore[planet_id];
			bestPlanetId = planet_id;
		}
	});
	console.log(activePlanetsScore);
	
	// Sprawdź, czy maksymalna trudność dostępna na najlepszej planecie jest taka sama jak bieżąca
	// Jeśli tak, nie musisz się ruszać
	if ((current_planet_id in activePlanetsScore) && planetsMaxDifficulty[bestPlanetId] == auto_switch_planet.current_difficulty)
		return current_planet_id;
	
	// Zapobieganie zmianie planety, jeśli wystąpiły> = 2 błędy podczas pobierania planet lub wystąpił błąd podczas pobierania aktualnego wyniku planety
	if (numberErrors >= 2 || ((current_planet_id in activePlanetsScore) && activePlanetsScore[current_planet_id] == 0))
		return null;
	
	return bestPlanetId;
}

// Przejście do następnej strefy po jej zakończeniu
function SwitchNextZone(attempt_no, planet_call) {
	if(attempt_no === undefined)
		attempt_no = 0;
	if (planet_call === undefined)
		planet_call = false;

	INJECT_update_grid();
	var next_zone = GetBestZone();

	if (next_zone !== undefined) {
		if (next_zone != target_zone) {
			console.log("Znaleziono nową najlepszą strefę: " + next_zone);
			INJECT_start_round(next_zone, access_token, attempt_no);
		} else {
			console.log("Aktualna strefa #" + target_zone + " jest teraz najlepsza. Nie trzeba zmieniać strefy.");
			if (planet_call === true)
				INJECT_start_round(target_zone, access_token, attempt_no);
		}
	} else {
		if (auto_switch_planet.active == true) {
			console.log("Nie ma więcej stref, planeta musi zostać ukończona. Wyszukiwanie nowego.");
			CheckSwitchBetterPlanet();
		} else {
			INJECT_leave_round();
			INJECT_update_grid();
			console.log("Nie ma więcej stref, planeta musi zostać ukończona. Musisz wybrać inną planetę!");
			target_zone = -1;
			INJECT_leave_planet();
		}
	}
}

// Sprawdź i przełącz na potencjalnie lepszą planetę, zacznij od najlepszej dostępnej strefy
function CheckSwitchBetterPlanet(difficulty_call) {
	if (difficulty_call === undefined)
		difficulty_call = false;

	var best_planet = GetBestPlanet();

	if (best_planet !== undefined && best_planet !== null && best_planet !== current_planet_id) {
		console.log("Planeta #" + best_planet + " ma wyższy potencjał punktów doswiadczenia. Przełączam na tą planetę. Narazie planeto #" + current_planet_id);
		INJECT_switch_planet(best_planet, function() {
			target_zone = GetBestZone();
			INJECT_start_round(target_zone, access_token);
		});
	} else if (best_planet == current_planet_id) {
		SwitchNextZone(0, difficulty_call);
	} else if (best_planet === null) {
		console.log("Za dużo błędów podczas przeszukiwania lepszej planety. Kontynuujmy bieżącą strefę.");
		INJECT_start_round(target_zone, access_token);
	} else {
		console.log("Nie ma lepszej planety od obecnej.");
	}
}

var INJECT_switch_planet = function(planet_id, callback) {
	// WYŁĄCZNIE do wyboru podczas bitwy
	if(!(gGame.m_State instanceof CBattleSelectionState))
		return;

	gui.updateTask("Próba przeniesienia się na planetę #" + planet_id);

	function wait_for_state_load() {
		if(gGame.m_IsStateLoading || gGame.m_State instanceof CPlanetSelectionState)
			setTimeout(function() { wait_for_state_load(); }, 50);
		else
			callback();
	}

	// Opuść naszą aktualną rundę, jeśli tego nie zrobiliśmy.
	INJECT_leave_round();

	// Upuść planetę
	INJECT_leave_planet(function() {
		
		// Upewnij się, że identyfikator planet_id jest poprawny (lub pomylimy się)
		var valid_planets = gGame.m_State.m_rgPlanets;
		var found = false;
		for(var i=0; i<valid_planets.length; i++)
			if (valid_planets[i].id == planet_id)
					found = true;
		if(!found) {
			gui.updateTask("Próba przejścia na nieprawidłową planetę. Wybierz inną.");
			gui.updateStatus(false);
			return;
		}

		// Dołącz do planety
		INJECT_join_planet(planet_id,
			function ( response ) {
				gGame.ChangeState( new CBattleSelectionState( planet_id ) );
				wait_for_state_load();
			},
			function ( response ) {
				ShowAlertDialog( 'Błąd dołączania do planety', 'Nie udało się dołączyć do planety. Załaduj ponownie grę lub spróbuj jeszcze raz.' );
			});
	});

}

// Opuść planetę
var INJECT_leave_planet = function(callback) {
	if(typeof callback !== 'function')
		callback = function() {};

	function wait_for_state_load() {
		if(gGame.m_IsStateLoading || gGame.m_State instanceof CBattleSelectionState)
			setTimeout(function() { wait_for_state_load(); }, 50);
		else {
			// Usuń bieżący identyfikator planety
			current_planet_id = undefined;

			INJECT_init();
			callback();
		}
	}

	// Anuluj limity czasu
	clearTimeout(current_timeout);

	// Opuść naszą aktualną rundę, jeśli tego nie zrobiliśmy.
	INJECT_leave_round();

	// (Zmodyfikowany) Domyślny kod
	gAudioManager.PlaySound( 'ui_select_backwards' );
	gServer.LeaveGameInstance(
		gGame.m_State.m_PlanetData.id,
		function() {
			gGame.ChangeState( new CPlanetSelectionState() );
			// Poczekaj na załadowanie nowego stanu, a następnie dołącz
			wait_for_state_load();
		}
	);
}

var INJECT_join_planet = function(planet_id, success_callback, error_callback) {
	if(typeof success_callback !== 'function')
		success_callback = function() {};
	if(typeof error_callback !== 'function')
		error_callback = function() {};
	function wait_for_state_load() {
		if(gGame.m_IsStateLoading || gGame.m_State instanceof CPlanetSelectionState)
			setTimeout(function() { wait_for_state_load(); }, 50);
		else {
			current_planet_id = planet_id;
			INJECT_init();
		}
	}

	// Zmodyfikowany kod domyślny
	var rgParams = {
		id: planet_id,
		access_token: access_token
	};

	$J.ajax({
		async: false,
		url: window.gServer.m_WebAPI.BuildURL( 'ITerritoryControlMinigameService', 'JoinPlanet', true ),
		method: 'POST',
		data: rgParams
	}).success( function( results, textStatus, request ) {
		if ( request.getResponseHeader( 'x-eresult' ) == 1 ) {
			success_callback( results );
			// Poczekaj na załadowanie nowego stanu, a następnie dołącz
			wait_for_state_load();
		}
		else {
			console.log(results, textStatus, request);
			error_callback();
		}
	}).fail( error_callback );
}

var INJECT_init_battle_selection = function() {
	// Zaktualizuj GUI
	gui.updateStatus(true);
	gui.updateTask("Inicjowanie menu wyboru bitwy.");

	// Automatycznie połącz najpierw najlepszą strefę
	if (auto_first_join == true) {
		firstJoin();
		function firstJoin() {
			// Poczekaj na stan i access_token
			if(access_token === undefined || gGame === undefined || gGame.m_IsStateLoading || gGame.m_State instanceof CPlanetSelectionState) {
				setTimeout(function() { firstJoin(); }, 100);
				console.log("waiting");
				return;
			}

			current_planet_id = window.gGame.m_State.m_PlanetData.id;

			var first_zone;
			if(target_zone === -1)
				first_zone = GetBestZone();
			else
				first_zone = target_zone

			if(access_token === undefined)
				INJECT_get_access_token();

			INJECT_start_round(first_zone, access_token);
		}
	}

	// Zastąp funkcję łączenia, więc kliknięcie kwadratu siatki spowoduje uruchomienie naszego kodu
	gServer.JoinZone = function (zone_id, callback, error_callback) {
		current_planet_id = window.gGame.m_State.m_PlanetData.id;
		INJECT_start_round(zone_id, access_token);
	}

	// Załącz funkcję kliknięcia siatki
	var grid_click_default = gGame.m_State.m_Grid.click;
	gGame.m_State.m_Grid.click = function(tileX, tileY) {
		// Uzyskaj wybrany identyfikator strefy
		var zoneIdx = _GetTileIdx( tileX, tileY );

		// Wróć, jeśli jest to obecna strefa (Nie chcesz, aby kliknięcie tej samej strefy pozostawiło / ponownie dołączyło)
		if(target_zone === zoneIdx)
			return;

		// Wróć, jeśli jest to ukończona strefa
		if(window.gGame.m_State.m_Grid.m_Tiles[zoneIdx].Info.captured) {
			console.log("Ręcznie wybrana strefa już przechwycona.");
			return;
		}

		// Zaktualizuj GUI
		gui.updateTask("Próba ręcznego przełączenia na strefę #" + zoneIdx);
		gui.progressbar.parent.removeChild(gui.progressbar)

		// Pozostaw istniejącą rundę
		INJECT_leave_round();

		// Dołącz do nowej rundy
		INJECT_start_round(zoneIdx, access_token);
	}

	// Załącz funkcję przycisku opuszczania planety
	gGame.m_State.m_LeaveButton.click = function(btn) {
		INJECT_leave_planet();
	};
}

var INJECT_init_planet_selection = function() {
	gui.updateStatus(true);
	gui.updateTask("Inicjowanie menu wyboru planety.");

	// Załącz funkcję przycisku dołączania do planety
	gServer.JoinPlanet = function(planet_id, success_callback, error_callback) {
		INJECT_join_planet(planet_id, success_callback, error_callback);
	}

	// Zaktualizuj GUI
	gui.updateStatus(false);
	gui.updateTask("At Planet Selection");
	gui.updateZone("None");
};

var INJECT_init = function() {
	if (gGame.m_State instanceof CBattleSelectionState)
		INJECT_init_battle_selection();
	else if (gGame.m_State instanceof CPlanetSelectionState)
		INJECT_init_planet_selection();
};

var INJECT_disable_animations = function() {
	var confirmed = confirm("Wyłączenie animacji znacznie zmniejszy zasoby, ale nie będzie już można ręcznie przełączać stref, dopóki nie odświeżysz. Ok?");

	if(confirmed) {
		requestAnimationFrame = function(){};
		$J("#disableAnimsBtn").prop("disabled",true).prop("value", "Animacje wyłączone.");
	}
};

// Przeprowadź kod inicjalizacyjny podczas ładowania
$J(document).ready(function() {
	// Automatycznie pobierz token dostępu
	INJECT_get_access_token();

	// Wywołaj naszą globalną funkcję init
	initGUI();
})
