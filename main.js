document.addEventListener("DOMContentLoaded", function(event) {

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const waveformSelect = document.getElementById('waveform');
    let selectedWaveform = 'sine';

    waveformSelect.addEventListener('change', function() {
        selectedWaveform = this.value;
    });

    const keyboardFrequencyMap = {
        '90': 261.625565300598634,  //Z - C
        '83': 277.182630976872096, //S - C#
        '88': 293.664767917407560,  //X - D
        '68': 311.126983722080910, //D - D#
        '67': 329.627556912869929,  //C - E
        '86': 349.228231433003884,  //V - F
        '71': 369.994422711634398, //G - F#
        '66': 391.995435981749294,  //B - G
        '72': 415.304697579945138, //H - G#
        '78': 440.000000000000000,  //N - A
        '74': 466.163761518089916, //J - A#
        '77': 493.883301256124111,  //M - B
        '81': 523.251130601197269,  //Q - C
        '50': 554.365261953744192, //2 - C#
        '87': 587.329535834815120,  //W - D
        '51': 622.253967444161821, //3 - D#
        '69': 659.255113825739859,  //E - E
        '82': 698.456462866007768,  //R - F
        '53': 739.988845423268797, //5 - F#
        '84': 783.990871963498588,  //T - G
        '54': 830.609395159890277, //6 - G#
        '89': 880.000000000000000,  //Y - A
        '55': 932.327523036179832, //7 - A#
        '85': 987.766602512248223,  //U - B
        '73': 1046.502261170122,    //I - C
        '56': 1108.730516992571,    //8 - C#
        '79': 1174.659153037467,    //O - D
        '57': 1244.508131081553,    //9 - D#
        '80': 1318.510330255652,    //P - E
    }

    window.addEventListener('keydown', keyDown, false);
    window.addEventListener('keyup', keyUp, false);

    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

    // simple peak limiter settings (now controlled by sliders)
    let limiterThreshold = 0.5; // when to start reducing
    let limiterCeiling = 0.6;   // never allow measured level to exceed this
    let limiterEngaged = false;

    // set up limiter sliders
    const thresholdSlider = document.getElementById('threshold');
    const ceilingSlider = document.getElementById('ceiling');
    const thresholdValue = document.getElementById('thresholdValue');
    const ceilingValue = document.getElementById('ceilingValue');

    if (thresholdSlider) {
        thresholdSlider.addEventListener('input', function() {
            limiterThreshold = parseFloat(this.value);
            thresholdValue.textContent = limiterThreshold.toFixed(2);
        });
    }

    if (ceilingSlider) {
        ceilingSlider.addEventListener('input', function() {
            limiterCeiling = parseFloat(this.value);
            ceilingValue.textContent = limiterCeiling.toFixed(2);
        });
    }

    // create an analyser node for the live volume meter
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    // connect audio graph: masterGain -> analyser -> destination
    masterGain.connect(analyser);
    analyser.connect(audioCtx.destination);

    activeOscillators = {}

    // set up canvas meter
    const meterCanvas = document.getElementById('meter');
    const meterCtx = meterCanvas ? meterCanvas.getContext('2d') : null;
    const meterWidth = meterCanvas ? meterCanvas.width : 300;
    const meterHeight = meterCanvas ? meterCanvas.height : 20;
    const meterValueEl = document.getElementById('meterValue');
    const meterData = new Uint8Array(analyser.fftSize);

    function drawMeter() {
        requestAnimationFrame(drawMeter);
        if (!meterCtx) return;

        analyser.getByteTimeDomainData(meterData);
        // compute RMS (root mean square) of waveform
        let sum = 0;
        for (let i = 0; i < meterData.length; i++) {
            const v = (meterData[i] - 128) / 128.0; // -1..1
            sum += v * v;
        }
        const rms = Math.sqrt(sum / meterData.length);
        // scale RMS to 0..1 for display, add small boost
        const level = Math.min(1, rms * 1.6);

        // update numeric readout (RMS and dB)
        if (meterValueEl) {
            const amp = rms; // 0..1
            let db;
            if (amp <= 1e-6) {
                db = '-∞';
            } else {
                db = (20 * Math.log10(amp)).toFixed(1);
            }
            meterValueEl.textContent = amp.toFixed(3) + ' (' + db + ' dB)';
        }

        // draw background
        meterCtx.fillStyle = '#222';
        meterCtx.fillRect(0, 0, meterWidth, meterHeight);

        // limiter: if level exceeds threshold, reduce masterGain smoothly so level stays under ceiling
        const currentGain = masterGain.gain.value || 1.0;
        if (level > limiterThreshold) {
            const requiredFactor = limiterCeiling / level;
            const newTarget = Math.min(currentGain, currentGain * requiredFactor);
            masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
            masterGain.gain.setTargetAtTime(newTarget, audioCtx.currentTime, 0.02);
            limiterEngaged = true;
        } else if (limiterEngaged && level < (limiterThreshold - 0.05)) {
            // restore gain slowly when safe
            masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
            masterGain.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.5);
            limiterEngaged = false;
        }

        // draw level bar
        const grad = meterCtx.createLinearGradient(0, 0, meterWidth, 0);
        grad.addColorStop(0, '#0f0');
        grad.addColorStop(0.6, '#ff0');
        grad.addColorStop(1, '#f00');
        meterCtx.fillStyle = grad;
        meterCtx.fillRect(0, 0, meterWidth * level, meterHeight);
    }

    // start the meter loop
    drawMeter();

    function keyDown(event) {
        const key = (event.detail || event.which).toString();
        if (keyboardFrequencyMap[key] && !activeOscillators[key]) {
        playNote(key);
        }
    }

    function keyUp(event) {
        const key = (event.detail || event.which).toString();
        if (keyboardFrequencyMap[key] && activeOscillators[key]) {
            const { osc, gain } = activeOscillators[key];
            gain.gain.setTargetAtTime(0.001, audioCtx.currentTime, 0.1);
            osc.stop(audioCtx.currentTime + 0.3);
            delete activeOscillators[key];
        }
    }

    function playNote(key) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.frequency.setValueAtTime(keyboardFrequencyMap[key], audioCtx.currentTime)
        osc.type = selectedWaveform;
        gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start();
        activeOscillators[key] = { osc, gain };
    }

});
