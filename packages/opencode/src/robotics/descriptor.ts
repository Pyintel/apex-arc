import z from "zod"

export const LinkSchema = z.object({
  name: z.string(),
  mass: z.number().describe("Mass in kg"),
  com: z.array(z.number()).length(3).describe("Center of mass [x, y, z] in meters"),
  inertia: z.array(z.number()).length(6).describe("Inertia matrix components [ixx, ixy, ixz, iyy, iyz, izz]"),
})

export const ActuatorSchema = z.object({
  kind: z.enum(["servo", "stepper", "dc", "harmonic"]),
  ratio: z.number().default(1).describe("Gear ratio"),
  limits: z.object({
    pos: z.array(z.number()).length(2).describe("Position limits [min, max] in radians or meters"),
    vel: z.number().describe("Velocity limit in rad/s or m/s"),
    torque: z.number().describe("Torque/force limit in Nm or N"),
  }),
})

export const SensorSchema = z.object({
  kind: z.enum(["encoder", "pot", "abs"]),
  cpr: z.number().optional().describe("Counts per revolution (for encoders)"),
  bits: z.number().optional().describe("Resolution in bits (for absolute encoders)"),
})

export const BusSchema = z.object({
  kind: z.enum(["can", "pwm", "uart", "i2c"]),
  id: z.number().describe("Bus ID / address"),
  rate: z.number().describe("Bus communication rate in Hz"),
})

export const JointSchema = z.object({
  name: z.string(),
  type: z.enum(["revolute", "continuous", "prismatic", "fixed", "floating", "planar"]),
  actuator: ActuatorSchema.optional(),
  sensor: SensorSchema.optional(),
  bus: BusSchema.optional(),
})

export const SafetySchema = z.object({
  estop: z.boolean().default(true).describe("Whether e-stop is connected"),
  limits: z.object({
    soft: z.object({
      pos: z.array(z.number()).length(2).optional(),
      vel: z.number().optional(),
    }).optional(),
    hard: z.object({
      pos: z.array(z.number()).length(2).optional(),
      vel: z.number().optional(),
    }).optional(),
  }),
  watchdogs: z.array(z.string()).default([]).describe("Active watchdogs"),
})

export const HardwareDescriptorSchema = z.object({
  robot: z.object({
    name: z.string(),
    links: z.array(LinkSchema),
  }),
  joints: z.array(JointSchema),
  safety: SafetySchema,
})

export type Link = z.infer<typeof LinkSchema>
export type Actuator = z.infer<typeof ActuatorSchema>
export type Sensor = z.infer<typeof SensorSchema>
export type Bus = z.infer<typeof BusSchema>
export type Joint = z.infer<typeof JointSchema>
export type Safety = z.infer<typeof SafetySchema>
export type HardwareDescriptor = z.infer<typeof HardwareDescriptorSchema>
