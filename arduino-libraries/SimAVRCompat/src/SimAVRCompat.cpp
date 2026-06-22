#include "SimAVRCompat.h"

#if defined(ARDUINO_ARCH_ESP32)

volatile uint8_t _sim_ddrd = 0;
volatile uint8_t _sim_portd = 0;
volatile uint8_t _sim_ddrb = 0;
volatile uint8_t _sim_portb = 0;
volatile uint8_t _sim_ddrc = 0;
volatile uint8_t _sim_portc = 0;

#endif
