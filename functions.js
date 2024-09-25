async function startWebcam(canvas, context, resultDiv, alertAudio, captureInterval) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const webcam = document.createElement('video');
        webcam.srcObject = stream;
        webcam.play();

        webcam.addEventListener('loadeddata', () => {
            setInterval(() => {
                captureImage(webcam, canvas, context, resultDiv, alertAudio);
            }, captureInterval);
        });
    } catch (err) {
        console.error('Error accessing webcam: ', err);
    }
}

function captureImage(webcam, canvas, context, resultDiv, alertAudio) {
    context.drawImage(webcam, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg');
    sendImageToServer(imageData, canvas, context, resultDiv, alertAudio);
}

function sendImageToServer(imageData, canvas, context, resultDiv, alertAudio) {
    const formData = new FormData();
    formData.append('image', dataURLtoFile(imageData, 'captured-image.jpeg'));

    fetch('http://172.206.2.48/process-image', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            console.log('Server response:', data);
            if (data.detections && data.detections.length > 0) {
                const detection = data.detections[0];
                switch (detection.class_name) {
                    case 'person-in-bed':
                        document.querySelector("#canvas").style.border = '1px solid black';
                        detection.class_name = 'Indivíduo no leito';
                        break;
                    case 'person-fall':
                        document.querySelector("#canvas").style.border = '1px solid red';
                        detection.class_name = 'Queda';
                        break;
                    case 'person-near-fall':
                        document.querySelector("#canvas").style.border = '1px solid black';
                        detection.class_name = 'Risco de queda';
                        break;
                    case 'person-moving-out':
                        document.querySelector("#canvas").style.border = '1px solid black';
                        detection.class_name = 'Indivíduo movendo para fora do leito';
                        break;
                    case 'person-out':
                        document.querySelector("#canvas").style.border = '1px solid black';
                        detection.class_name = 'Indivíduo fora do leito';
                        break;
                    default:
                        document.querySelector("#canvas").style.border = '1px solid black';
                        console.warn("Classe não encontrada, aplicando cor preta");
                }            
                resultDiv.textContent = `Detectado: ${detection.class_name} - (Confiança: ${(detection.confidence * 100).toFixed(0)}%)`;

                let currentAudio = null; // variável para armazenar o áudio que está tocando

                function playAlertAudio(audio) {
                    // Verifica se já há um áudio tocando
                    if (currentAudio && !currentAudio.paused) {
                        // Pausa o áudio atual
                        currentAudio.pause();
                        currentAudio.currentTime = 0; // Opcional: reinicia o áudio para o início
                    }

                    // Reproduz o novo áudio
                    audio.play();
                    currentAudio = audio; // Atualiza o áudio atual
                }
                if (detection.class_name.toLowerCase() === 'person-moving-out') {

                    playAlertAudio(alertAudio);

                }

                if (detection.class_name.toLowerCase() === 'person-fall') {
                    playAlertAudio(alertAudio1);
                }

                drawRectangle(detection, canvas, context);
            } else {
                resultDiv.textContent = 'No detection found.';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            resultDiv.textContent = 'Error sending image to server.';
        });
}

function drawRectangle(detection, canvas, context) {
    const boundingBox = detection.bounding_box;

    if (!Array.isArray(boundingBox) || boundingBox.length !== 4) {
        console.error('Detecção inválida:', detection);
        return;
    }

    const x = boundingBox[0] / 640;
    const y = boundingBox[1] / 480;
    const width = boundingBox[2] / 640;
    const height = boundingBox[3] / 480;

    if (x > 1 || y > 1 || width > 1 || height > 1 || x < 0 || y < 0 || width < 0 || height < 0) {
        console.error('Bounding box fora do intervalo esperado:', boundingBox);
        return;
    }

    console.log(`Desenhando retângulo normalizado em (${x}, ${y}) com tamanho (${width}x${height})`);

    const rectX = x * canvas.width;
    const rectY = y * canvas.height;
    const rectWidth = width * canvas.width;
    const rectHeight = height * canvas.height;

    const className = detection.class_name.toLowerCase();
    console.log("Classe detectada:", className);

    let color;
    switch (className) {
        case 'person-in-bed':
            color = 'yellow';
            break;
        case 'person-fall':
            color = 'blue';
            break;
        case 'person-near-fall':
            color = 'red';
            break;
        case 'person-moving-out':
            color = 'purple';
            break;
        case 'person-out':
            color = 'orange';
            break;
        default:
            color = 'black';
            console.warn("Classe não encontrada, aplicando cor preta");
    }

    console.log("Cor do retângulo:", color);

    context.strokeStyle = color;
    context.lineWidth = 3;
    context.strokeRect(rectX, rectY, rectWidth, rectHeight);
}

function playAlertAudio(alertAudio) {
    alertAudio.play();
}

function dataURLtoFile(dataURL, filename) {
    const [header, data] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(data);
    const array = [];
    for (let i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i));
    }
    return new File([new Uint8Array(array)], filename, { type: mime });
}
