import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';
import 'firebase/database';

const startupTime = new Date().valueOf();

const firebaseConfig = {
  apiKey: "AIzaSyAMlK4Jz60lEYnZvcFzGo-JqOPQ-Q2oXP0",
  authDomain: "web-rtc-b2af7.firebaseapp.com",
  projectId: "web-rtc-b2af7",
  storageBucket: "web-rtc-b2af7.appspot.com",
  messagingSenderId: "593149952785",
  appId: "1:593149952785:web:1867797b5db06dac09c2b0"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const stopWebCam = document.getElementById('stopWebCam');
const mute = document.getElementById('mute');
const callTime = document.getElementById("callTime");
// 1. Setup media sources

let activeRoom = false;
let webCamStarted = false;

const activateAnswerBtn = () => {
  if (activeRoom && webCamStarted) {
    answerButton.disabled = false;
  }
}

webcamButton.onclick = async () => {

  const localStream = new MediaStream(await navigator.mediaDevices.getUserMedia({ video: true, audio: true }));
  const remoteStream = new MediaStream();
  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    webCamStarted = true;
    pc.addTrack(track, localStream);
  });
  activateAnswerBtn();

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  webcamButton.disabled = true;
  mute.disabled = false;
  stopWebCam.disabled = false;
};

mute.addEventListener('click', async function () {
  webcamVideo.srcObject.getAudioTracks().forEach(t => t.enabled = !t.enabled);

  const micIcon = mute.firstChild;

  if (micIcon.classList.contains('fa-microphone')) {
    micIcon.classList.remove('fa-microphone')
    micIcon.classList.add('fa-microphone-slash')
    mute.style.background = 'red'
  } else {
    micIcon.classList.remove('fa-microphone-slash')
    micIcon.classList.add('fa-microphone')
    mute.style.background = 'white'
  }
})
stopWebCam.addEventListener('click', function () {
  webcamVideo.srcObject.getVideoTracks().forEach(t => t.enabled = !t.enabled);

  const cameraIcon = stopWebCam.firstChild

  if (cameraIcon.classList.contains('fa-video')) {
    cameraIcon.classList.remove('fa-video')
    cameraIcon.classList.add('fa-video-slash')
    stopWebCam.style.background = 'red'
  } else {
    cameraIcon.classList.remove('fa-video-slash')
    cameraIcon.classList.add('fa-video')
    stopWebCam.style.background = 'white'
  }

})

firestore.collection('calls').orderBy('timeStamp').limitToLast(1).onSnapshot((doc) => {
  doc.docs.forEach((x) => {
    if (x.data().timeStamp > startupTime) {
      callInput.innerText = x.id;
      callTime.innerText = new Date(x.data().timeStamp).toISOString().replace('T', ' ').substr(length, 20)
      activeRoom = true;
      activateAnswerBtn();
    } else {
      callInput.innerText = "No active rooms";
      answerButton.disabled = true;
    }
  })
})

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  // firestore.collection('calls').onSnapshot((doc) => {
  //   doc.docs.forEach((x) => {
  //     if (x.metadata.hasPendingWrites) {
  //       callInput.innerText = x.id
  //     }
  //   })
  // })

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer, timeStamp: new Date().valueOf() });

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {

  const callId = callInput.innerText;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};
