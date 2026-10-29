'use strict';
// Helper del ticket #6: la scheda Meteo chiama Open-Meteo all'apertura della dashboard.
// Nei test di altre sezioni che passano dalla dashboard e verificano `app.richiesteEsterne`,
// intercettare Open-Meteo con una risposta finta (le richieste intercettate non sono "esterne"):
//   const { meteoFinto } = require('../lib/meteo-finto');
//   const app = await apri({ rete: [meteoFinto()] });

const PREVISIONI = 'https://api.open-meteo.com/**';

/** Risposta plausibile delle previsioni (28/10/2026 e i 5 giorni seguenti). */
function rispostaMeteoFinta() {
  return {
    latitude: 41.77, longitude: 12.23, timezone: 'Europe/Rome',
    current: {
      time: '2026-10-28T10:00', temperature_2m: 18.4, apparent_temperature: 16.6,
      relative_humidity_2m: 72, weather_code: 2, wind_speed_10m: 14.3
    },
    daily: {
      time: ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'],
      weather_code: [2, 61, 0, 3, 95, 45],
      temperature_2m_max: [21.2, 19.6, 22.4, 20.1, 17.8, 18.3],
      temperature_2m_min: [12.1, 13.4, 11.2, 10.6, 12.9, 9.4]
    }
  };
}

/** Voce per `apri({ rete: [...] })` che risponde a ogni richiesta verso api.open-meteo.com. */
function meteoFinto(risposta) {
  return { url: PREVISIONI, json: risposta || rispostaMeteoFinta() };
}

module.exports = { meteoFinto, rispostaMeteoFinta, PREVISIONI };
