#ifndef SIM_AVR_COMPAT_H
#define SIM_AVR_COMPAT_H

#if defined(ARDUINO_ARCH_ESP32)

#include <Arduino.h>

/** Registres AVR émulés — co-simulation (le binaire n'est pas flashé sur la carte). */
extern volatile uint8_t _sim_ddrd;
extern volatile uint8_t _sim_portd;
extern volatile uint8_t _sim_ddrb;
extern volatile uint8_t _sim_portb;
extern volatile uint8_t _sim_ddrc;
extern volatile uint8_t _sim_portc;

#define DDRD _sim_ddrd
#define PORTD _sim_portd
#define DDRB _sim_ddrb
#define PORTB _sim_portb
#define DDRC _sim_ddrc
#define PORTC _sim_portc

#endif

#endif
