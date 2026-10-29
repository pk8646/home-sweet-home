'use strict';
// Simulatore di Open-Meteo (ticket #6, esteso da #16 con i dati orari e la minima/massima di oggi).
// La scheda Meteo chiama Open-Meteo all'apertura della dashboard. Nei test di altre sezioni che passano dalla
// dashboard e verificano `app.richiesteEsterne`, intercettare Open-Meteo con una risposta finta (le richieste
// intercettate non sono "esterne"):
//   const { meteoFinto } = require('../lib/meteo-finto');
//   const app = await apri({ rete: [meteoFinto()] });

const PREVISIONI = 'https://api.open-meteo.com/**';

function due(n) { return (n < 10 ? '0' : '') + n; }

/** 'AAAA-MM-GG' + n giorni (calendario, senza fusi orari). */
function piuGiorni(iso, n) {
  const p = iso.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.getUTCFullYear() + '-' + due(d.getUTCMonth() + 1) + '-' + due(d.getUTCDate());
}

/**
 * Risposta plausibile delle previsioni, come la chiede l'app (oggi e i 3 giorni seguenti, dati orari da
 * mezzanotte di oggi). Opzioni:
 *   ora: 'AAAA-MM-GGTHH:MM' di `current.time` (default '2026-10-28T10:00')
 *   temperatura, codice: valori attuali (default 18.4 e 2)
 *   giorni: quanti giorni in `daily`, oggi compreso (default 4)
 *   codiciGiornalieri, minime, massime: array per i giorni, oggi compreso
 *   pioggia: { 'AAAA-MM-GGTHH:00': percentuale } (le altre ore 0)
 *   codiciOrari: { 'AAAA-MM-GGTHH:00': codice } (le altre ore 0, Sereno)
 *   senzaOrari: true per una risposta senza `hourly`
 * La temperatura di ogni ora è il numero dell'ora contato da mezzanotte di oggi (00:00 -> 0°, 23:00 -> 23°,
 * 01:00 di domani -> 25°), così ogni casella oraria ha un valore riconoscibile.
 */
function rispostaMeteoFinta(opzioni) {
  const o = opzioni || {};
  const ora = o.ora || '2026-10-28T10:00';
  const oggi = ora.slice(0, 10);
  const nGiorni = o.giorni || 4;
  const daily = {
    time: [],
    weather_code: (o.codiciGiornalieri || [2, 61, 0, 3, 95, 45]).slice(0, nGiorni),
    temperature_2m_max: (o.massime || [21.2, 19.6, 22.4, 20.1, 17.8, 18.3]).slice(0, nGiorni),
    temperature_2m_min: (o.minime || [12.1, 13.4, 11.2, 10.6, 12.9, 9.4]).slice(0, nGiorni)
  };
  for (let g = 0; g < nGiorni; g++) daily.time.push(piuGiorni(oggi, g));
  const hourly = { time: [], weather_code: [], temperature_2m: [], precipitation_probability: [] };
  for (let h = 0; h < nGiorni * 24; h++) {
    const t = piuGiorni(oggi, Math.floor(h / 24)) + 'T' + due(h % 24) + ':00';
    hourly.time.push(t);
    hourly.weather_code.push(o.codiciOrari && o.codiciOrari[t] !== undefined ? o.codiciOrari[t] : 0);
    hourly.temperature_2m.push(h);
    hourly.precipitation_probability.push(o.pioggia && o.pioggia[t] !== undefined ? o.pioggia[t] : 0);
  }
  const risposta = {
    latitude: 41.77, longitude: 12.23, timezone: 'Europe/Rome',
    current: {
      time: ora,
      temperature_2m: o.temperatura !== undefined ? o.temperatura : 18.4,
      apparent_temperature: 16.6,
      weather_code: o.codice !== undefined ? o.codice : 2,
      wind_speed_10m: 14.3
    },
    hourly: hourly,
    daily: daily
  };
  if (o.senzaOrari) delete risposta.hourly;
  return risposta;
}

/** Voce per `apri({ rete: [...] })` che risponde a ogni richiesta verso api.open-meteo.com. */
function meteoFinto(risposta) {
  return { url: PREVISIONI, json: risposta || rispostaMeteoFinta() };
}

module.exports = { meteoFinto, rispostaMeteoFinta, PREVISIONI };
