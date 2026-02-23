'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage, Message } from './ChatMessage';
import {
    DiagnosisState,
    getNextQuestion,
    processAnswer,
    isComplete,
    generateSummary,
    generateExecutiveDiagnosis,
    TOTAL_QUESTIONS
} from '@/lib/diagnosis/orchestrator';

// IMPORTA TUS NUEVOS ESTILOS AQUÍ.
// Asegúrate de que el archivo 'styles.css' de la landing page (Dark Mode / Glassmorphism) 
// esté importado en tu proyecto Next.js (por ejemplo, en layout.tsx o globals.css).
import '@/app/globals.css'; // o donde hayas puesto el CSS Premium.

export function DiagnosisChatPremium() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [diagnosisState, setDiagnosisState] = useState<DiagnosisState>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionResult, setSubmissionResult] = useState<{
        success: boolean;
        leadId?: string;
        taskId?: string;
        error?: string;
    } | null>(null);
    const [hasPendingSync, setHasPendingSync] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
        // Auto-focus input on mount and after messages update
        inputRef.current?.focus();
    }, [messages]);

    const initialized = useRef(false);

    // Initialize with welcome message and first question
    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        const initConversation = async () => {
            setIsTyping(true);
            await delay(500);

            const welcomeMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '¡Hola! 👋 Soy tu consultor de IA en Dimensión eXpert. Para poder armar una hoja de ruta, haré unas breves preguntas. Primero, ¿Cómo se llama tu empresa y a qué sector pertenece?',
                timestamp: new Date(),
            };

            setMessages([welcomeMessage]);
            setIsTyping(false);

            await delay(800);

            const firstQuestion = getNextQuestion({});
            if (firstQuestion) {
                setIsTyping(true);
                await delay(600);

                const questionMessage: Message = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: firstQuestion.question,
                    timestamp: new Date(),
                };

                setMessages(prev => [...prev, questionMessage]);
                setIsTyping(false);
            }
        };

        // initConversation() (Se omite la auto-inicialización duplicada de first question para simplificar el flujo)
        // Check for pending sync
        const pending = localStorage.getItem('pending_diagnosis');
        if (pending) {
            setHasPendingSync(true);
        } else {
             initConversation();
        }
    }, []);

    const syncPendingData = async () => {
        const pending = localStorage.getItem('pending_diagnosis');
        if (!pending) return;

        try {
            const state = JSON.parse(pending);
            setIsSubmitting(true);
            setIsTyping(true);

            const syncingMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '🔄 Detectamos un diagnóstico pendiente. Intentando sincronizar con el CRM...',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, syncingMessage]);

            await handleDiagnosisComplete(state, true);
        } catch (error) {
            console.error('Error parsing pending diagnosis:', error);
            localStorage.removeItem('pending_diagnosis');
            setHasPendingSync(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (!inputValue.trim() || isTyping || isComplete(diagnosisState)) return;

        const userMessage: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: inputValue.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');

        // Process the answer
        const result = processAnswer(diagnosisState, inputValue.trim());

        if (!result.valid) {
            setIsTyping(true);
            await delay(500);

            const errorMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: result.error || 'Por favor, intenta de nuevo.',
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, errorMessage]);
            setIsTyping(false);
            return;
        }

        // Update state with new answer
        const newState = { ...diagnosisState, ...result.updates };
        setDiagnosisState(newState);

        // Check if diagnosis is complete
        if (isComplete(newState)) {
            await handleDiagnosisComplete(newState);
            return;
        }

        // Get next question
        const nextQuestion = getNextQuestion(newState);
        if (nextQuestion) {
            setIsTyping(true);
            await delay(700);

            const questionMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: nextQuestion.question,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, questionMessage]);
            setIsTyping(false);
        }
    };

    const handleDiagnosisComplete = async (state: DiagnosisState, isSyncing = false) => {
        if (!isSyncing) {
            setIsTyping(true);
            await delay(500);

            const completionMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '¡Excelente! He recopilado toda la información necesaria. Ahora te muestro el resumen de tu diagnóstico y lo guardaré en nuestro sistema para contactarte.',
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, completionMessage]);
            setIsTyping(false);
        }

        // Submit to API
        setIsSubmitting(true);

        try {
            const response = await fetch('/api/diagnosis/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state),
            });

            const data = await response.json();

            if (response.ok) {
                setSubmissionResult({
                    success: true,
                    leadId: data.leadId,
                    taskId: data.taskId,
                });

                // Clear local storage on success
                localStorage.removeItem('pending_diagnosis');
                setHasPendingSync(false);

                await delay(500);

                const successMessage: Message = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: '✅ Tu información ha sido guardada correctamente en el CRM. Un miembro de nuestro equipo se pondrá en contacto contigo en las próximas 24 horas para revisar tu diagnóstico.',
                    timestamp: new Date(),
                };

                setMessages(prev => [...prev, successMessage]);
            } else {
                throw new Error(data.error || 'Error al guardar');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Error desconocido';

            // SAVE LOCALLY ON FAILURE
            localStorage.setItem('pending_diagnosis', JSON.stringify(state));
            setHasPendingSync(true);

            setSubmissionResult({
                success: false,
                error: errorMsg,
            });

            const errorMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `⚠️ Hubo un problema al guardar tu información: "${errorMsg}". Tu diagnóstico ha sido guardado localmente en tu navegador. Puedes intentar sincronizarlo de nuevo cuando el problema se resuelva.`,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const currentQuestionNumber = Object.keys(diagnosisState).length;
    const progressPercentage = (currentQuestionNumber / TOTAL_QUESTIONS) * 100;

    return (
        <div style={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Header Mapped to New Design */}
            <div className="chat-header">
                <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem", color: "var(--text-main)" }}>Diagnóstico Estratégico AI</h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Nuestro experto virtual evaluará tu empresa.</p>

                {hasPendingSync && (
                    <button
                        onClick={syncPendingData}
                        disabled={isSubmitting}
                        style={{ marginTop: "1rem", backgroundColor: "#ff9800", color: "#fff", padding: "0.5rem 1rem", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold" }}
                    >
                        SINCRONIZAR DATOS PENDIENTES
                    </button>
                )}
            </div>

            {/* Progress Bar Mapped to New Design */}
            <div className="progress-container" style={{ padding: "0 1.5rem" }}>
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${Math.max(20, progressPercentage)}%` }} // Minimum 20% visual feel
                    />
                </div>
            </div>

            {/* Messages Area Mapped to New Design */}
            <div className="messages-area" id="chatMessages">
                {messages.map((message) => (
                    <div key={message.id} className={`message-bubble message-${message.role}`}>
                        {message.content}
                    </div>
                ))}

                {isTyping && (
                    <div className="typing-indicator" id="typingIndicator">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                    </div>
                )}

                {isComplete(diagnosisState) && (
                    <div style={{ padding: "1rem", backgroundColor: "rgba(0, 240, 255, 0.05)", border: "1px solid rgba(0,240,255,0.2)", borderRadius: "8px", marginTop: "1rem" }}>
                        <DiagnosisSummary state={diagnosisState} />
                        <ExecutiveSummary state={diagnosisState} />
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area Mapped to New Design */}
            {!isComplete(diagnosisState) && (
                <div className="input-area">
                    <form id="chatForm" onSubmit={handleSubmit}>
                        <div className="input-container">
                            <textarea
                                ref={inputRef}
                                id="chatInput"
                                className="message-input"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Escribe tu respuesta aquí..."
                                disabled={isTyping}
                                rows={1}
                            />
                            <button
                                type="submit"
                                className="send-button"
                                disabled={!inputValue.trim() || isTyping}
                                aria-label="Enviar mensaje"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 2L11 13" />
                                    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                                </svg>
                            </button>
                        </div>
                    </form>
                    <div className="privacy-notice" style={{ marginTop: "1rem", marginBottom: "0" }}>
                        <span>🔒</span> Cero Spam. Datos 100% encriptados y confidenciales.
                    </div>
                </div>
            )}
        </div>
    );
}

// Diagnosis Summary Component
function DiagnosisSummary({ state }: { state: DiagnosisState }) {
    const summary = generateSummary(state);

    return (
        <div style={{ color: "var(--text-main)" }}>
            <h3 style={{ color: "var(--accent-cyan)", marginBottom: "0.5rem" }}>
                Resumen de Respuestas
            </h3>
            <dl style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                <div>
                    <dt style={{ color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>Empresa</dt>
                    <dd>{state.empresa} ({state.industria})</dd>
                </div>
                <div>
                    <dt style={{ color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>Dolor Principal</dt>
                    <dd>{state.dolorPrincipal}</dd>
                </div>
                <div>
                    <dt style={{ color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>Prioridad</dt>
                    <dd>
                        <span style={{ fontWeight: "bold", color: "var(--accent-cyan)" }}>{state.prioridad}/10</span>
                    </dd>
                </div>
            </dl>
        </div>
    );
}

// Executive Summary Component 
function ExecutiveSummary({ state }: { state: DiagnosisState }) {
    return (
        <div style={{ marginTop: "1rem", borderTop: "1px solid var(--glass-border)", paddingTop: "1rem", color: "var(--text-main)" }}>
            <h3 style={{ color: "var(--accent-violet)", fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                Diagnóstico Ejecutivo en Proceso
            </h3>

            <div style={{ fontSize: "0.9rem", lineHeight: "1.5" }}>
                <p style={{ marginBottom: "0.5rem" }}><strong>¡Gracias por compartir esta información detallada!</strong></p>
                <p style={{ marginBottom: "0.5rem" }}>Nuestro Motor de IA ha recibido los datos de <strong>{state.empresa}</strong> y está construyendo actualmente el Diagnóstico Estratégico.</p>
                <p>En este reporte analizaremos el impacto de <em>{state.dolorPrincipal}</em> y estructuraremos una hoja de ruta orientada a resultados.</p>
            </div>
            
            <div style={{ marginTop: "1rem", fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "right" }}>
                Dimensión eXpert AI Engine
            </div>
        </div>
    );
}

// Utility
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
