/**
 * iFrame Integration Service
 * Handles seamless game embedding and cross-origin communication
 */
class IFrameService {
  constructor() {
    this.allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://naffles.com',
      'https://admin.naffles.com',
      'https://staging.naffles.com',
      'https://dev.naffles.com'
    ];
  }

  /**
   * Generate iFrame embed code for a game
   * @param {string} gameType - Type of game
   * @param {Object} config - Game configuration
   * @returns {Object} iFrame embed information
   */
  generateEmbedCode(gameType, config = {}) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const gameUrl = `${baseUrl}/games/${gameType}`;
    
    // Build query parameters
    const params = new URLSearchParams();
    if (config.sessionId) params.append('sessionId', config.sessionId);
    if (config.tokenType) params.append('tokenType', config.tokenType);
    if (config.betAmount) params.append('betAmount', config.betAmount);
    if (config.theme) params.append('theme', config.theme);
    if (config.autoStart) params.append('autoStart', 'true');

    const fullUrl = params.toString() ? `${gameUrl}?${params.toString()}` : gameUrl;

    const iframeCode = `<iframe 
      src="${fullUrl}"
      width="${config.width || '800'}"
      height="${config.height || '600'}"
      frameborder="0"
      allowfullscreen
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      title="Naffles ${gameType} Game"
      id="naffles-game-${gameType}-${Date.now()}"
    ></iframe>`;

    return {
      embedCode: iframeCode,
      gameUrl: fullUrl,
      dimensions: {
        width: config.width || '800',
        height: config.height || '600'
      },
      gameType,
      sessionId: config.sessionId
    };
  }

  /**
   * Generate postMessage communication script
   * @param {string} gameType - Type of game
   * @returns {string} JavaScript code for parent-iframe communication
   */
  generateCommunicationScript(gameType) {
    return `
      <script>
        (function() {
          const gameIframe = document.getElementById('naffles-game-${gameType}');
          const allowedOrigins = ${JSON.stringify(this.allowedOrigins)};
          
          // Listen for messages from the game iframe
          window.addEventListener('message', function(event) {
            // Verify origin
            if (!allowedOrigins.includes(event.origin)) {
              console.warn('Received message from unauthorized origin:', event.origin);
              return;
            }
            
            const data = event.data;
            
            // Handle different message types
            switch(data.type) {
              case 'GAME_INITIALIZED':
                console.log('Game initialized:', data.payload);
                // Trigger custom event for parent application
                window.dispatchEvent(new CustomEvent('nafflesGameInitialized', {
                  detail: data.payload
                }));
                break;
                
              case 'GAME_STATE_CHANGED':
                console.log('Game state changed:', data.payload);
                window.dispatchEvent(new CustomEvent('nafflesGameStateChanged', {
                  detail: data.payload
                }));
                break;
                
              case 'GAME_COMPLETED':
                console.log('Game completed:', data.payload);
                window.dispatchEvent(new CustomEvent('nafflesGameCompleted', {
                  detail: data.payload
                }));
                break;
                
              case 'GAME_ERROR':
                console.error('Game error:', data.payload);
                window.dispatchEvent(new CustomEvent('nafflesGameError', {
                  detail: data.payload
                }));
                break;
                
              case 'RESIZE_REQUEST':
                if (gameIframe && data.payload.width && data.payload.height) {
                  gameIframe.style.width = data.payload.width + 'px';
                  gameIframe.style.height = data.payload.height + 'px';
                }
                break;
                
              default:
                console.log('Unknown message type:', data.type);
            }
          });
          
          // Send message to game iframe
          window.sendMessageToGame = function(type, payload) {
            if (gameIframe && gameIframe.contentWindow) {
              gameIframe.contentWindow.postMessage({
                type: type,
                payload: payload,
                source: 'parent'
              }, '*');
            }
          };
          
          // Helper functions for common actions
          window.nafflesGameAPI = {
            // Initialize game with configuration
            initializeGame: function(config) {
              window.sendMessageToGame('INITIALIZE_GAME', config);
            },
            
            // Send action to game
            sendAction: function(action, data) {
              window.sendMessageToGame('GAME_ACTION', { action, data });
            },
            
            // Request current game state
            requestGameState: function() {
              window.sendMessageToGame('REQUEST_GAME_STATE', {});
            },
            
            // Pause/resume game
            pauseGame: function() {
              window.sendMessageToGame('PAUSE_GAME', {});
            },
            
            resumeGame: function() {
              window.sendMessageToGame('RESUME_GAME', {});
            },
            
            // End game
            endGame: function() {
              window.sendMessageToGame('END_GAME', {});
            }
          };
          
          console.log('Naffles Game API initialized for ${gameType}');
        })();
      </script>
    `;
  }

  /**
   * Generate complete embed package
   * @param {string} gameType - Type of game
   * @param {Object} config - Game configuration
   * @returns {Object} Complete embed package
   */
  generateCompleteEmbed(gameType, config = {}) {
    const embedInfo = this.generateEmbedCode(gameType, config);
    const communicationScript = this.generateCommunicationScript(gameType);
    
    const completeEmbed = `
      ${embedInfo.embedCode}
      ${communicationScript}
      
      <script>
        // Example usage:
        // Listen for game events
        window.addEventListener('nafflesGameInitialized', function(event) {
          console.log('Game ready:', event.detail);
        });
        
        window.addEventListener('nafflesGameCompleted', function(event) {
          console.log('Game finished:', event.detail);
          // Handle game completion (show results, redirect, etc.)
        });
        
        // Initialize the game when ready
        window.addEventListener('load', function() {
          setTimeout(function() {
            if (window.nafflesGameAPI) {
              window.nafflesGameAPI.initializeGame({
                autoStart: ${config.autoStart || false}
              });
            }
          }, 1000);
        });
      </script>
    `;

    return {
      ...embedInfo,
      communicationScript,
      completeEmbed,
      apiMethods: [
        'initializeGame(config)',
        'sendAction(action, data)',
        'requestGameState()',
        'pauseGame()',
        'resumeGame()',
        'endGame()'
      ],
      events: [
        'nafflesGameInitialized',
        'nafflesGameStateChanged', 
        'nafflesGameCompleted',
        'nafflesGameError'
      ]
    };
  }

  /**
   * Validate iframe origin
   * @param {string} origin - Origin to validate
   * @returns {boolean} Is allowed origin
   */
  isAllowedOrigin(origin) {
    return this.allowedOrigins.includes(origin);
  }

  /**
   * Generate responsive iframe CSS
   * @param {Object} config - Configuration options
   * @returns {string} CSS for responsive iframe
   */
  generateResponsiveCSS(config = {}) {
    const aspectRatio = config.aspectRatio || '4:3';
    const maxWidth = config.maxWidth || '100%';
    
    return `
      <style>
        .naffles-game-container {
          position: relative;
          width: 100%;
          max-width: ${maxWidth};
          margin: 0 auto;
        }
        
        .naffles-game-container::before {
          content: '';
          display: block;
          padding-top: ${this.calculatePaddingTop(aspectRatio)};
        }
        
        .naffles-game-container iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: none;
          border-radius: ${config.borderRadius || '8px'};
          box-shadow: ${config.boxShadow || '0 4px 6px rgba(0, 0, 0, 0.1)'};
        }
        
        @media (max-width: 768px) {
          .naffles-game-container {
            max-width: 100%;
            margin: 0;
          }
        }
      </style>
    `;
  }

  /**
   * Calculate padding-top for aspect ratio
   * @param {string} aspectRatio - Aspect ratio (e.g., '16:9', '4:3')
   * @returns {string} Padding-top percentage
   */
  calculatePaddingTop(aspectRatio) {
    const [width, height] = aspectRatio.split(':').map(Number);
    return `${(height / width) * 100}%`;
  }

  /**
   * Generate game-specific embed configurations
   * @param {string} gameType - Type of game
   * @returns {Object} Game-specific configuration
   */
  getGameSpecificConfig(gameType) {
    const configs = {
      'blackjack': {
        width: '900',
        height: '700',
        aspectRatio: '9:7',
        theme: 'casino',
        features: ['cards', 'chips', 'actions']
      },
      'coinToss': {
        width: '600',
        height: '600',
        aspectRatio: '1:1',
        theme: 'minimal',
        features: ['coin', 'animation', 'choice']
      },
      'rockPaperScissors': {
        width: '700',
        height: '500',
        aspectRatio: '7:5',
        theme: 'playful',
        features: ['moves', 'timer', 'score']
      }
    };

    return configs[gameType] || {
      width: '800',
      height: '600',
      aspectRatio: '4:3',
      theme: 'default'
    };
  }

  /**
   * Generate iframe security headers
   * @returns {Object} Security headers for iframe responses
   */
  getSecurityHeaders() {
    return {
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "frame-ancestors 'self' " + this.allowedOrigins.join(' '),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
  }

  /**
   * Create iframe-safe game URL
   * @param {string} gameType - Type of game
   * @param {Object} params - URL parameters
   * @returns {string} Safe iframe URL
   */
  createIFrameURL(gameType, params = {}) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const gameUrl = `${baseUrl}/games/iframe/${gameType}`;
    
    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        urlParams.append(key, value.toString());
      }
    });

    return urlParams.toString() ? `${gameUrl}?${urlParams.toString()}` : gameUrl;
  }
}

module.exports = new IFrameService();